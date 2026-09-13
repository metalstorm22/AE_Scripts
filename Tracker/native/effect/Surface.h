#pragma once
#include <array>
#include <cmath>
#include <stdexcept>
namespace scenetrack {
using Vec=std::array<double,3>;
inline Vec sub(Vec a,Vec b){return {a[0]-b[0],a[1]-b[1],a[2]-b[2]};}
inline Vec cross(Vec a,Vec b){return {a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]};}
inline double length(Vec a){return std::sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);}
inline Vec norm(Vec a){double n=length(a);if(n<1e-8)throw std::runtime_error("Choose separated, non-collinear points.");for(auto& v:a)v/=n;return a;}
inline std::array<Vec,4> surface(Vec a,Vec b,Vec c){
 Vec ab=sub(b,a),ac=sub(c,a);double span=std::fmax(length(ab),length(ac));
 if(length(cross(ab,ac))<span*span*.001)throw std::runtime_error("These points are too nearly collinear. Choose a wider triangle.");
 Vec x=norm(ab),z=norm(cross(x,ac)),y=cross(z,x),center{};
 for(int i=0;i<3;i++)center[i]=(a[i]+b[i]+c[i])/3;
 std::array<Vec,4> result;int signX[]={-1,1,1,-1},signY[]={-1,-1,1,1};
 for(int k=0;k<4;k++)for(int i=0;i<3;i++)result[k][i]=center[i]+span*.5*(signX[k]*x[i]+signY[k]*y[i]);return result;
}
}
