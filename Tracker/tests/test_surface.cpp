#include "../native/effect/Surface.h"
#include <cassert>
int main(){
 using namespace scenetrack;
 auto p=surface({0,0,5},{2,0,5},{0,2,5});
 for(auto v:p)assert(std::abs(v[2]-5)<1e-10);
 assert(std::abs(length(sub(p[1],p[0]))-2)<1e-10);
 for(int axis=0;axis<3;axis++){double c=0;for(auto v:p)c+=v[axis]/4;assert(std::abs(c-(axis==2?5:2./3))<1e-10);}
 bool rejected=false;try{surface({0,0,0},{1,0,0},{2,1e-9,0});}catch(...){rejected=true;}assert(rejected);
}
