// Standalone ingestion/geometry test. This does not simulate AE's UI or lifecycle.
#include "../native/effect/SceneTrack.mm"
#include <cassert>
#include <chrono>
int main(int argc,char** argv){
 PF_EventExtra closing{};closing.e_type=PF_Event_CLOSE_CONTEXT;
 assert(overlay(nullptr,nullptr,nullptr,&closing)==PF_Err_NONE);
 assert(overlay(nullptr,nullptr,nullptr,nullptr)==PF_Err_NONE);
 if(argc!=2)return 2;State s;std::snprintf(s.path,sizeof(s.path),"%s",argv[1]);
 auto start=std::chrono::steady_clock::now();auto data=load(s,true);
 assert(data->fps==24&&data->width==3840&&data->height==2160);
 assert(data->frames.count(320)&&data->poses.count(320));
 auto pose=data->poses.at(320);int checked=0;double maxError=0;
 for(auto p:data->frames.at(320))if(data->world.count(p.id)){
 auto v=data->world.at(p.id);double q[3]={};for(int i=0;i<3;i++){q[i]=pose.t[i];for(int j=0;j<3;j++)q[i]+=pose.R[3*i+j]*v[j];}
 auto error=std::hypot(data->width*.5+pose.zoom*q[0]/q[2]-p.x,data->height*.5+pose.zoom*q[1]/q[2]-p.y);maxError=std::fmax(maxError,error);checked++;
 }
 assert(checked>50&&maxError<1e-6);
 std::printf("Native ingestion: %zu frames, %zu points, %d projections, max error %.9f px, %.3f seconds\n",data->frames.size(),data->world.size(),checked,maxError,std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count());
}
