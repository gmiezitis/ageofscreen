#include "CaptureManager.hpp"
#include <iostream>
#include <string>

CaptureManager::CaptureManager(Napi::Env env) : _env(env) {
    InitializeD3D();
}

CaptureManager::~CaptureManager() {
    if (_session) _session.Close();
    if (_framePool) _framePool.Close();
    if (_context) _context->Release();
    if (_device) _device->Release();
}

void CaptureManager::InitializeD3D() {
    D3D_FEATURE_LEVEL featureLevels[] = { D3D_FEATURE_LEVEL_11_0 };
    HRESULT hr = D3D11CreateDevice(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, featureLevels, ARRAYSIZE(featureLevels),
        D3D11_SDK_VERSION, &_device, nullptr, &_context);
    
    if (FAILED(hr)) {
        std::cerr << "Failed to create D3D11 device" << std::endl;
    }
}

Napi::Value CaptureManager::GetDisplays(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Array displays = Napi::Array::New(env);
    
    // In a final implementation, we'd use DXGI to enum adapters and monitors
    // Or simpler, Screen.AllScreens from a .NET bridge. 
    // Here we'll return a placeholder for now
    Napi::Object d1 = Napi::Object::New(env);
    d1.Set("id", "screen:0");
    d1.Set("name", "Primary Display");
    displays.Set((uint32_t)0, d1);
    
    return displays;
}

Napi::Value CaptureManager::StartCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Placeholder implementation to verify build
    if (_captureItem) {
        return Napi::Boolean::New(env, true);
    }
    
    return Napi::Boolean::New(env, false);
}

Napi::Value CaptureManager::StopCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (_session) {
        _session.Close();
        _session = nullptr;
    }
    return Napi::Boolean::New(env, true);
}

Napi::Value CaptureManager::GetWindowBounds(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        return env.Null();
    }

    int64_t hwndValue = 0;
    if (info[0].IsNumber()) {
        hwndValue = info[0].As<Napi::Number>().Int64Value();
    } else if (info[0].IsString()) {
        const auto hwndText = info[0].As<Napi::String>().Utf8Value();
        try {
            hwndValue = std::stoll(hwndText);
        } catch (...) {
            return env.Null();
        }
    } else {
        return env.Null();
    }

    const auto hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(hwndValue));
    if (!hwnd || !IsWindow(hwnd)) {
        return env.Null();
    }

    RECT rect{};
    if (!GetWindowRect(hwnd, &rect)) {
        return env.Null();
    }

    const auto width = rect.right - rect.left;
    const auto height = rect.bottom - rect.top;
    if (width <= 0 || height <= 0) {
        return env.Null();
    }

    Napi::Object bounds = Napi::Object::New(env);
    bounds.Set("x", Napi::Number::New(env, rect.left));
    bounds.Set("y", Napi::Number::New(env, rect.top));
    bounds.Set("width", Napi::Number::New(env, width));
    bounds.Set("height", Napi::Number::New(env, height));
    return bounds;
}
