#pragma once

#include <windows.h>
#include <unknwn.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <winrt/Windows.UI.Composition.h>
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
    
    // Windows Graphics Capture members
    winrt::Windows::Graphics::Capture::GraphicsCaptureItem _captureItem{ nullptr };
    winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool _framePool{ nullptr };
    winrt::Windows::Graphics::Capture::GraphicsCaptureSession _session{ nullptr };
    
    void InitializeD3D();
};
