#pragma once

#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <napi.h>
#include <wrl.h>

class CaptureManager {
public:
    CaptureManager(Napi::Env env);
    ~CaptureManager();

    Napi::Value StartCapture(const Napi::CallbackInfo& info);
    Napi::Value StopCapture(const Napi::CallbackInfo& info);
    Napi::Value GetDisplays(const Napi::CallbackInfo& info);
    Napi::Value GetWindowBounds(const Napi::CallbackInfo& info);

private:
    Napi::Env _env;
    ID3D11Device* _device = nullptr;
    ID3D11DeviceContext* _context = nullptr;

    void InitializeD3D();
};
