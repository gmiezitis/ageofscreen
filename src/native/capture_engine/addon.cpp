#include <napi.h>
#include "CaptureManager.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  CaptureManager* manager = new CaptureManager(env);
  
  exports.Set(Napi::String::New(env, "getDisplays"),
              Napi::Function::New(env, [manager](const Napi::CallbackInfo& info) {
                return manager->GetDisplays(info);
              }));
              
  exports.Set(Napi::String::New(env, "startCapture"),
              Napi::Function::New(env, [manager](const Napi::CallbackInfo& info) {
                return manager->StartCapture(info);
              }));
              
  exports.Set(Napi::String::New(env, "stopCapture"),
              Napi::Function::New(env, [manager](const Napi::CallbackInfo& info) {
                return manager->StopCapture(info);
              }));

  exports.Set(Napi::String::New(env, "getWindowBounds"),
              Napi::Function::New(env, [manager](const Napi::CallbackInfo& info) {
                return manager->GetWindowBounds(info);
              }));

  return exports;
}

NODE_API_MODULE(capture_engine, Init)
