#import <Cocoa/Cocoa.h>
#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_EffectUI.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "AEGP_SuiteHandler.h"
#include "AEFX_SuiteHelper.h"
#include <adobesdk/DrawbotSuite.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <map>
#include <memory>
#include <string>
#include <vector>
#include "Surface.h"

#ifndef SCENETRACK_ROOT
#define SCENETRACK_ROOT "."
#endif
namespace {
enum { INPUT, LOAD, SHOW, SIZE, CLEAR, CAMERA, NULLS, SOLID, STATE, COUNT };
struct State { uint32_t version=1; char path[4096]={}; int32_t ids[3]={-1,-1,-1}; };
struct Point { int id; double x,y; };
struct Pose { double R[9],t[3],zoom; };
struct Solve { std::string cameraJSON; double fps; int width,height; std::map<int,scenetrack::Vec> world;std::map<int,Pose> poses; std::map<int,std::vector<Point>> frames; };
std::map<std::string,std::shared_ptr<Solve>> cache;
AEGP_PluginID pluginID=0;
SPBasicSuite* hostSuites=nullptr;
std::string queuedScript;
bool idleRegistered=false, executing=false;
void trace(const char* message){if(auto f=std::fopen(SCENETRACK_ROOT "/jobs/native-effect-events.log","a")){std::fprintf(f,"%s\n",message);std::fclose(f);}}
A_Err idle(AEGP_GlobalRefcon,AEGP_IdleRefcon,A_long*){
 if(queuedScript.empty()||executing)return A_Err_NONE;
 auto script=std::move(queuedScript);queuedScript.clear();executing=true;trace("idle: execute begin");
 try{AEGP_SuiteHandler suites(hostSuites);AEGP_MemHandle error=nullptr;
 auto err=suites.UtilitySuite6()->AEGP_ExecuteScript(pluginID,script.c_str(),FALSE,nullptr,&error);trace("idle: execute returned");
 if(error){void* p=nullptr;suites.MemorySuite1()->AEGP_LockMemHandle(error,&p);std::string message=p?(char*)p:"Layer creation failed";suites.MemorySuite1()->AEGP_UnlockMemHandle(error);suites.MemorySuite1()->AEGP_FreeMemHandle(error);if(!message.empty()){trace(message.c_str());suites.UtilitySuite6()->AEGP_ReportInfo(pluginID,message.c_str());}}
 if(err)suites.UtilitySuite6()->AEGP_ReportInfo(pluginID,"SceneTrack could not create the layer. See the native event log.");
 }catch(...){trace("idle: exception");}
 executing=false;return A_Err_NONE;
}
State readState(PF_InData* in_data, PF_ArbitraryH h) {
 State s; if(h){auto p=PF_LOCK_HANDLE(h);if(p){std::memcpy(&s,p,sizeof(s));PF_UNLOCK_HANDLE(h);}}return s;
}
PF_ArbitraryH makeState(PF_InData* in_data,const State& s) {
 auto h=PF_NEW_HANDLE(sizeof(State));if(!h)throw PF_Err_OUT_OF_MEMORY;
 auto p=PF_LOCK_HANDLE(h);std::memcpy(p,&s,sizeof(s));PF_UNLOCK_HANDLE(h);return h;
}
// POD is deliberately fixed-width and versioned; no owning pointers enter AE's project data.
PF_Err arbitrary(PF_InData* in_data, PF_ArbParamsExtra* e) {
 auto& u=e->u;
 switch(e->which_function){
 case PF_Arbitrary_NEW_FUNC:*u.new_func_params.arbPH=makeState(in_data,State{});break;
 case PF_Arbitrary_DISPOSE_FUNC:if(u.dispose_func_params.arbH)PF_DISPOSE_HANDLE(u.dispose_func_params.arbH);break;
 case PF_Arbitrary_COPY_FUNC:*u.copy_func_params.dst_arbPH=makeState(in_data,readState(in_data,u.copy_func_params.src_arbH));break;
 case PF_Arbitrary_FLAT_SIZE_FUNC:*u.flat_size_func_params.flat_data_sizePLu=sizeof(State);break;
 case PF_Arbitrary_FLATTEN_FUNC:{if(u.flatten_func_params.buf_sizeLu<sizeof(State))return PF_Err_BAD_CALLBACK_PARAM;auto s=readState(in_data,u.flatten_func_params.arbH);std::memcpy(u.flatten_func_params.flat_dataPV,&s,sizeof(s));break;}
 case PF_Arbitrary_UNFLATTEN_FUNC:{if(u.unflatten_func_params.buf_sizeLu!=sizeof(State))return PF_Err_BAD_CALLBACK_PARAM;State s;std::memcpy(&s,u.unflatten_func_params.flat_dataPV,sizeof(s));if(s.version!=1||!std::memchr(s.path,0,sizeof(s.path)))return PF_Err_BAD_CALLBACK_PARAM;*u.unflatten_func_params.arbPH=makeState(in_data,s);break;}
 case PF_Arbitrary_INTERP_FUNC:*u.interp_func_params.interpPH=makeState(in_data,readState(in_data,u.interp_func_params.tF<1?u.interp_func_params.left_arbH:u.interp_func_params.right_arbH));break;
 case PF_Arbitrary_COMPARE_FUNC:{auto a=readState(in_data,u.compare_func_params.a_arbH),b=readState(in_data,u.compare_func_params.b_arbH);*u.compare_func_params.compareP=std::memcmp(&a,&b,sizeof(a))?PF_ArbCompare_NOT_EQUAL:PF_ArbCompare_EQUAL;break;}
 case PF_Arbitrary_PRINT_SIZE_FUNC:*u.print_size_func_params.print_sizePLu=32;break;
 case PF_Arbitrary_PRINT_FUNC:std::snprintf(u.print_func_params.print_bufferPC,u.print_func_params.print_sizeLu,"SceneTrack solve reference");break;
 case PF_Arbitrary_SCAN_FUNC:return PF_Err_BAD_CALLBACK_PARAM;
 }return PF_Err_NONE;
}
void saveState(PF_InData* in_data,PF_OutData* out,PF_ParamDef* params[],const State& s){
 // Edit AE's supplied parameter value only on USER_CHANGED_PARAM / click events.
 auto h=params[STATE]->u.arb_d.value;
 if(!h){h=makeState(in_data,s);params[STATE]->u.arb_d.value=h;}else{auto p=PF_LOCK_HANDLE(h);std::memcpy(p,&s,sizeof(s));PF_UNLOCK_HANDLE(h);}
 params[STATE]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;
 out->out_flags|=PF_OutFlag_REFRESH_UI;
}
std::shared_ptr<Solve> load(const State& s,bool reload=false){
 if(!s.path[0])return {};
 if(!reload&&cache.count(s.path))return cache.at(s.path);
 @autoreleasepool {
 NSData* bytes=[NSData dataWithContentsOfFile:[NSString stringWithUTF8String:s.path]];
 if(!bytes||bytes.length>128*1024*1024)throw std::runtime_error("Cannot read this solve. Load result.json from a completed SceneTrack job.");
 NSError* error=nil;id root=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:&error];
 if(![root isKindOfClass:[NSDictionary class]]||![root[@"schema"] isEqual:@"scenetrack/1"])throw std::runtime_error("Not a SceneTrack result.");
 auto solve=std::make_shared<Solve>();solve->fps=[root[@"metadata"][@"fps"] doubleValue];solve->width=[root[@"metadata"][@"width"] intValue];solve->height=[root[@"metadata"][@"height"] intValue];
 NSArray* models=root[@"models"];if(![models isKindOfClass:[NSArray class]]||models.count!=1)throw std::runtime_error("Choose a job with one reconstruction for this native preview.");
 if(!(solve->fps>0&&solve->width>0&&solve->height>0))throw std::runtime_error("Invalid solve metadata.");
 for(NSDictionary* point in models[0][@"points"]){NSArray* p=point[@"position"];if(p.count==3)solve->world[[point[@"id"] intValue]]={[p[0] doubleValue],[p[1] doubleValue],[p[2] doubleValue]};}
 for(NSDictionary* row in models[0][@"poses"]){NSArray* r=row[@"R"],*t=row[@"t"];if(r.count!=3||t.count!=3)continue;Pose pose{};for(int i=0;i<3;i++){for(int j=0;j<3;j++)pose.R[i*3+j]=[r[i][j] doubleValue];pose.t[i]=[t[i] doubleValue]*1000;}pose.zoom=[row[@"zoom"] doubleValue];solve->poses[[row[@"frame"] intValue]]=pose;}
 for(NSDictionary* frame in models[0][@"observations"]){auto& points=solve->frames[[frame[@"frame"] intValue]];for(NSDictionary* p in frame[@"points"]){NSArray* uv=p[@"projected"]?:p[@"uv"];if(uv.count!=2)continue;double x=[uv[0] doubleValue],y=[uv[1] doubleValue];if(std::isfinite(x)&&std::isfinite(y))points.push_back({[p[@"id"] intValue],x,y});}}
 if(solve->poses.empty()||solve->frames.empty()||solve->world.empty())throw std::runtime_error("Load the full result.json, not a compact panel or placement file.");
 NSMutableArray* poses=[NSMutableArray array];
 for(NSDictionary* row in models[0][@"poses"])[poses addObject:@{@"frame":row[@"frame"],@"position":row[@"position"],@"orientation":row[@"orientation"],@"zoom":row[@"zoom"]}];
 NSDictionary* payload=@{@"schema":@"scenetrack/1",@"metadata":root[@"metadata"],@"models":@[@{@"id":models[0][@"id"],@"poses":poses,@"ranges":models[0][@"ranges"],@"points":@[],@"observations":@[]}]};
 NSData* serialized=[NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];solve->cameraJSON.assign((const char*)serialized.bytes,serialized.length);
 if(cache.size()>=4)cache.clear();cache[s.path]=solve;return solve;
 }
}
Point toFrame(PF_InData* in,PF_EventExtra* e,Point p){
 PF_FixedPoint q={};q.x=FLOAT2FIX(p.x*in->downsample_x.num/in->downsample_x.den);q.y=FLOAT2FIX(p.y*in->downsample_y.num/in->downsample_y.den);
 if((*e->contextH)->w_type==PF_Window_COMP)e->cbs.layer_to_comp(e->cbs.refcon,e->contextH,in->current_time,in->time_scale,&q);
 e->cbs.source_to_frame(e->cbs.refcon,e->contextH,&q);return {p.id,FIX_2_FLOAT(q.x),FIX_2_FLOAT(q.y)};
}
void invalidateViewer(PF_InData* in,PF_EventExtra* e){AEGP_SuiteHandler suites(in->pica_basicP);suites.AppSuite6()->PF_InvalidateRect(e->contextH,nullptr);e->evt_out_flags|=PF_EO_UPDATE_NOW;}
PF_Err overlay(PF_InData* in,PF_OutData* out,PF_ParamDef* params[],PF_EventExtra* e){
 // Close-context notifications can omit parameter data during selection changes.
 // Reject lifecycle events before touching any host handles or parameters.
 if(!e)return PF_Err_NONE;
 if(e->e_type!=PF_Event_NEW_CONTEXT&&e->e_type!=PF_Event_MOUSE_EXITED&&e->e_type!=PF_Event_DRAW&&e->e_type!=PF_Event_DO_CLICK&&e->e_type!=PF_Event_ADJUST_CURSOR)return PF_Err_NONE;
 if(!e->contextH||!*e->contextH)return PF_Err_NONE;
 if((*e->contextH)->w_type!=PF_Window_COMP&&(*e->contextH)->w_type!=PF_Window_LAYER)return PF_Err_NONE;
 if(e->e_type==PF_Event_NEW_CONTEXT||e->e_type==PF_Event_MOUSE_EXITED){for(auto& v:(*e->contextH)->plugin_state)v=0;e->evt_out_flags|=PF_EO_UPDATE_NOW;return PF_Err_NONE;}
 if(!params||!params[SHOW]||!params[STATE]||!params[SIZE])return PF_Err_NONE;
 if(!params[SHOW]->u.bd.value)return PF_Err_NONE;
 if(e->e_type!=PF_Event_DRAW&&e->e_type!=PF_Event_DO_CLICK&&e->e_type!=PF_Event_ADJUST_CURSOR)return PF_Err_NONE;
 auto state=readState(in,params[STATE]->u.arb_d.value);auto solve=load(state);if(!solve)return PF_Err_NONE;
 int frame=std::lround(double(in->current_time)/in->time_scale*solve->fps);
 auto found=solve->frames.find(frame);if(found==solve->frames.end())return PF_Err_NONE; // never borrow points from another frame
 std::vector<Point> points;for(auto p:found->second)points.push_back(toFrame(in,e,p));
 if(e->e_type==PF_Event_ADJUST_CURSOR){
 auto mouse=e->u.adjust_cursor.screen_point;auto near=points;std::sort(near.begin(),near.end(),[&](Point a,Point b){return std::hypot(a.x-mouse.h,a.y-mouse.v)<std::hypot(b.x-mouse.h,b.y-mouse.v);});
 int next[4]={};if(near.size()>=3&&std::hypot(near[2].x-mouse.h,near[2].y-mouse.v)<70){
 double area=std::abs((near[1].x-near[0].x)*(near[2].y-near[0].y)-(near[1].y-near[0].y)*(near[2].x-near[0].x));
 if(area>16){next[0]=1;for(int i=0;i<3;i++)next[i+1]=near[i].id+1;}}
 bool changed=false;for(int i=0;i<4;i++){changed|=next[i]!=(*e->contextH)->plugin_state[i];(*e->contextH)->plugin_state[i]=next[i];}if(changed)invalidateViewer(in,e);return PF_Err_NONE;
 }
 if(e->e_type==PF_Event_DO_CLICK){
 auto mouse=e->u.do_click.screen_point;double distance=144;int id=-1;
 for(auto p:points){double d=std::pow(p.x-mouse.h,2)+std::pow(p.y-mouse.v,2);if(d<distance){distance=d;id=p.id;}}
 bool shift=e->u.do_click.modifiers&PF_Mod_SHIFT_KEY;
 // A direct click must not depend on the host having delivered a prior hover event.
 if(!shift&&distance>16){auto near=points;std::sort(near.begin(),near.end(),[&](Point a,Point b){return std::hypot(a.x-mouse.h,a.y-mouse.v)<std::hypot(b.x-mouse.h,b.y-mouse.v);});
 (*e->contextH)->plugin_state[0]=0;
 if(near.size()>=3&&std::hypot(near[2].x-mouse.h,near[2].y-mouse.v)<70){double area=std::abs((near[1].x-near[0].x)*(near[2].y-near[0].y)-(near[1].y-near[0].y)*(near[2].x-near[0].x));if(area>16){(*e->contextH)->plugin_state[0]=1;for(int i=0;i<3;i++)(*e->contextH)->plugin_state[i+1]=near[i].id+1;}}}

 if(!shift&&(*e->contextH)->plugin_state[0]&&distance>16){for(int i=0;i<3;i++)state.ids[i]=int((*e->contextH)->plugin_state[i+1])-1;saveState(in,out,params,state);invalidateViewer(in,e);e->evt_out_flags|=PF_EO_HANDLED_EVENT;return PF_Err_NONE;}
 if(id<0)return PF_Err_NONE;
 if(!shift){state.ids[0]=id;state.ids[1]=state.ids[2]=-1;}else{auto hit=std::find(std::begin(state.ids),std::end(state.ids),id);if(hit!=std::end(state.ids))*hit=-1;else{auto slot=std::find(std::begin(state.ids),std::end(state.ids),-1);if(slot!=std::end(state.ids))*slot=id;}}
 saveState(in,out,params,state);invalidateViewer(in,e);e->evt_out_flags|=PF_EO_HANDLED_EVENT;return PF_Err_NONE;
 }
 bool anySelected=false;for(int id:state.ids)anySelected|=id>=0;
 if(!anySelected&&(*e->contextH)->plugin_state[0])for(int i=0;i<3;i++)state.ids[i]=int((*e->contextH)->plugin_state[i+1])-1;
 AEGP_SuiteHandler suites(in->pica_basicP);DRAWBOT_DrawRef drawing=nullptr;
 suites.EffectCustomUISuite1()->PF_GetDrawingReference(e->contextH,&drawing);if(!drawing)return PF_Err_NONE;
 DRAWBOT_Suites db{};PF_Err err=AEFX_AcquireDrawbotSuites(in,out,&db);if(err)return err;
 struct ReleaseDrawbot {PF_InData* in;PF_OutData* out;~ReleaseDrawbot(){AEFX_ReleaseDrawbotSuites(in,out);}} release{in,out};
 DRAWBOT_SurfaceRef surface=nullptr;DRAWBOT_SupplierRef supplier=nullptr;
 db.drawbot_suiteP->GetSurface(drawing,&surface);db.drawbot_suiteP->GetSupplier(drawing,&supplier);
 {
 DRAWBOT_ColorRGBA green={.15f,.9f,.55f,1.f},yellow={1.f,.75f,.15f,1.f};
 DRAWBOT_PenP normal(db.supplier_suiteP,supplier,&green,1.4f),selected(db.supplier_suiteP,supplier,&yellow,2.f);
 double radius=params[SIZE]->u.sd.value;std::vector<Point> chosen;
 DRAWBOT_PathP normalPath(db.supplier_suiteP,supplier),selectedPath(db.supplier_suiteP,supplier);
 for(auto p:points){bool active=std::find(std::begin(state.ids),std::end(state.ids),p.id)!=std::end(state.ids);auto path=active?static_cast<DRAWBOT_PathRef>(selectedPath):static_cast<DRAWBOT_PathRef>(normalPath);double r=active?radius+2:radius;
 db.path_suiteP->MoveTo(path,p.x-r,p.y);db.path_suiteP->LineTo(path,p.x+r,p.y);db.path_suiteP->MoveTo(path,p.x,p.y-r);db.path_suiteP->LineTo(path,p.x,p.y+r);if(active)chosen.push_back(p);
 }
 db.surface_suiteP->StrokePath(surface,normal,normalPath);db.surface_suiteP->StrokePath(surface,selected,selectedPath);
 if(chosen.size()==3&&solve->poses.count(frame)){
 try{
 auto corners=scenetrack::surface(solve->world.at(state.ids[0]),solve->world.at(state.ids[1]),solve->world.at(state.ids[2]));auto pose=solve->poses.at(frame);std::vector<Point> projected;
 for(auto v:corners){double q[3]={};for(int i=0;i<3;i++){q[i]=pose.t[i];for(int j=0;j<3;j++)q[i]+=pose.R[i*3+j]*v[j];}if(q[2]<=0)break;projected.push_back(toFrame(in,e,{-1,solve->width*.5+pose.zoom*q[0]/q[2],solve->height*.5+pose.zoom*q[1]/q[2]}));}
 if(projected.size()==4){DRAWBOT_PathP plane(db.supplier_suiteP,supplier);db.path_suiteP->MoveTo(plane,projected[0].x,projected[0].y);for(int i=1;i<=4;i++)db.path_suiteP->LineTo(plane,projected[i%4].x,projected[i%4].y);db.surface_suiteP->StrokePath(surface,selected,plane);}
 }catch(const std::exception&){/* Degenerate selections have no surface preview. */}
 }
 }
 e->evt_out_flags|=PF_EO_HANDLED_EVENT;return PF_Err_NONE;
}
std::string jsonString(const char* s){@autoreleasepool{NSData* d=[NSJSONSerialization dataWithJSONObject:@[[NSString stringWithUTF8String:s]] options:0 error:nil];std::string value((const char*)d.bytes,d.length);return value.substr(1,value.size()-2);}}
PF_Err action(PF_InData* in,PF_OutData* out,PF_ParamDef* params[],int index){
 trace("action: begin");auto state=readState(in,params[STATE]->u.arb_d.value);
 if(index==LOAD){@autoreleasepool{NSOpenPanel* panel=[NSOpenPanel openPanel];panel.canChooseDirectories=NO;panel.allowsMultipleSelection=NO;panel.title=@"Load a completed SceneTrack result.json";
 if([panel runModal]!=NSModalResponseOK)return PF_Err_NONE;
 State candidate;const char* path=panel.URL.path.UTF8String;if(std::strlen(path)>=sizeof(candidate.path))throw std::runtime_error("Solve path is too long.");std::strcpy(candidate.path,path);auto solve=load(candidate,true);
 if(solve->width!=in->width||solve->height!=in->height)throw std::runtime_error("Solve dimensions do not match this footage layer.");saveState(in,out,params,candidate);return PF_Err_NONE;}}
 if(index==CLEAR){state.ids[0]=state.ids[1]=state.ids[2]=-1;saveState(in,out,params,state);return PF_Err_NONE;}
 if(index!=CAMERA&&index!=NULLS&&index!=SOLID)return PF_Err_NONE;
 trace("action: placement requested");
 if(!state.path[0])throw std::runtime_error("Load a completed solve first.");
 int count=0;for(int id:state.ids)if(id>=0)count++;
 if(index==NULLS&&!count)throw std::runtime_error("Click a tracking point in the Composition viewer first.");
 if(index==SOLID&&count!=3)throw std::runtime_error("Select three points on the same physical surface. Shift-click to add points.");
 AEGP_SuiteHandler suites(in->pica_basicP);AEGP_LayerH layer=nullptr;A_long layerID=0;
 auto layerErr=suites.PFInterfaceSuite1()->AEGP_GetEffectLayer(in->effect_ref,&layer);if(layerErr||!layer)throw std::runtime_error("Cannot identify the effect layer.");trace("action: got layer");layerErr=suites.LayerSuite8()->AEGP_GetLayerID(layer,&layerID);if(layerErr)throw std::runtime_error("Cannot identify the layer ID.");trace("action: got layer id");
 std::string ids="[";for(int i=0;i<3;i++){if(i)ids+=",";ids+=std::to_string(state.ids[i]);}ids+="]";
 auto solve=load(state);std::string payloadJSON;
 @autoreleasepool {
 NSData* encoded=[NSData dataWithBytes:solve->cameraJSON.data() length:solve->cameraJSON.size()];NSMutableDictionary* payload=[NSJSONSerialization JSONObjectWithData:encoded options:NSJSONReadingMutableContainers error:nil];NSMutableDictionary* model=payload[@"models"][0];
 NSMutableArray* selected=[NSMutableArray array];for(int id:state.ids)if(id>=0&&solve->world.count(id)){auto p=solve->world.at(id);[selected addObject:@{@"id":@(id),@"position":@[@(p[0]),@(p[1]),@(p[2])]}];}model[@"points"]=selected;
 int frame=std::lround(double(in->current_time)/in->time_scale*solve->fps);NSMutableArray* observed=[NSMutableArray array];auto found=solve->frames.find(frame);if(found!=solve->frames.end())for(auto p:found->second)[observed addObject:@{@"id":@(p.id)}];model[@"observations"]=@[@{@"frame":@(frame),@"points":observed}];
 NSData* result=[NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];payloadJSON.assign((const char*)result.bytes,result.length);
 }
 std::string script="$.evalFile("+jsonString(SCENETRACK_ROOT "/ae/native_bridge.jsx")+");SceneTrackNative("+std::to_string(layerID)+","+jsonString(state.path)+","+ids+","+jsonString(index==CAMERA?"camera":index==NULLS?"null":"solid")+","+payloadJSON+");";
 if(!queuedScript.empty()||executing)throw std::runtime_error("A placement action is already pending.");
 queuedScript=std::move(script);trace("action: queued for idle");suites.UtilitySuite6()->AEGP_CauseIdleRoutinesToBeCalled();return PF_Err_NONE;
}
PF_Err setup(PF_InData* in_data,PF_OutData* out_data){
 PF_ParamDef def{};
 PF_ADD_BUTTON("Solve","Load Solve...",0,PF_ParamFlag_SUPERVISE,LOAD);
 AEFX_CLR_STRUCT(def);PF_ADD_CHECKBOX("Tracking points","Show in viewer",TRUE,0,SHOW);
 AEFX_CLR_STRUCT(def);PF_ADD_SLIDER("Point size",2,12,2,12,4,SIZE);
 PF_ADD_BUTTON("Selection","Clear Selection",0,PF_ParamFlag_SUPERVISE,CLEAR);
 PF_ADD_BUTTON("Camera","Create Camera",0,PF_ParamFlag_SUPERVISE,CAMERA);
 PF_ADD_BUTTON("Placement","Create Null",0,PF_ParamFlag_SUPERVISE,NULLS);
 PF_ADD_BUTTON("Surface","Create Solid from 3 Points",0,PF_ParamFlag_SUPERVISE,SOLID);
 AEFX_CLR_STRUCT(def);PF_ADD_ARBITRARY2("Solve reference",0,0,PF_ParamFlag_CANNOT_TIME_VARY,PF_PUI_NO_ECW_UI,nullptr,STATE,nullptr);
 PF_CustomUIInfo ui{};ui.events=PF_CustomEFlag_COMP|PF_CustomEFlag_LAYER;
 out_data->num_params=COUNT;return in_data->inter.register_ui(in_data->effect_ref,&ui);
}
}
extern "C" DllExport PF_Err EffectMain(PF_Cmd cmd,PF_InData* in,PF_OutData* out,PF_ParamDef* params[],PF_LayerDef* output,void* extra){
 try{@autoreleasepool{switch(cmd){
 case PF_Cmd_GLOBAL_SETUP:{out->my_version=PF_VERSION(0,2,0,PF_Stage_DEVELOP,1);out->out_flags=PF_OutFlag_CUSTOM_UI|PF_OutFlag_PIX_INDEPENDENT|PF_OutFlag_DEEP_COLOR_AWARE;AEGP_SuiteHandler suites(in->pica_basicP);hostSuites=in->pica_basicP;if(!idleRegistered){auto e=suites.UtilitySuite6()->AEGP_RegisterWithAEGP(nullptr,"SceneTrack",&pluginID);if(e)return e;e=suites.RegisterSuite5()->AEGP_RegisterIdleHook(pluginID,idle,nullptr);if(e)return e;idleRegistered=true;}trace("global setup");break;}
 case PF_Cmd_PARAMS_SETUP:return setup(in,out);
 case PF_Cmd_ARBITRARY_CALLBACK:return arbitrary(in,(PF_ArbParamsExtra*)extra);
 case PF_Cmd_EVENT:return overlay(in,out,params,(PF_EventExtra*)extra);
 case PF_Cmd_USER_CHANGED_PARAM:return action(in,out,params,((PF_UserChangedParamExtra*)extra)->param_index);
 case PF_Cmd_RENDER:{AEGP_SuiteHandler suites(in->pica_basicP);return suites.WorldTransformSuite1()->copy(in->effect_ref,&params[0]->u.ld,output,nullptr,nullptr);}
 case PF_Cmd_ABOUT:std::snprintf(out->return_msg,sizeof(out->return_msg),"SceneTrack 0.2 development\rLoad solve; click points; Shift-click to add/remove. Three points preview a surface. Local solver remains in the SceneTrack panel.");break;
 case PF_Cmd_GLOBAL_SETDOWN:queuedScript.clear();cache.clear();trace("global setdown");break;
 default:break;
 }}return PF_Err_NONE;}catch(PF_Err err){return err;}catch(const std::exception& e){std::snprintf(out->return_msg,sizeof(out->return_msg),"%s",e.what());out->out_flags|=PF_OutFlag_DISPLAY_ERROR_MESSAGE;return PF_Err_NONE;}catch(...){return PF_Err_INTERNAL_STRUCT_DAMAGED;}
}

extern "C" DllExport PF_Err PluginDataEntryFunction(
 PF_PluginDataPtr data,PF_PluginDataCB callback,SPBasicSuite*,const char*,const char*){
 PF_Err result=PF_Err_INVALID_CALLBACK;PF_REGISTER_EFFECT(data,callback,"SceneTrack","SceneTrack Camera Tracker","SceneTrack",AE_RESERVED_INFO);return result;
}
extern "C" DllExport PF_Err PluginDataEntryFunction2(
 PF_PluginDataPtr data,PF_PluginDataCB2 callback,SPBasicSuite*,const char*,const char*){
 PF_Err result=PF_Err_INVALID_CALLBACK;PF_REGISTER_EFFECT_EXT2(data,callback,"SceneTrack","SceneTrack Camera Tracker","SceneTrack",AE_RESERVED_INFO,"EffectMain","");return result;
}
