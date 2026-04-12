{
  "targets": [
    {
      "target_name": "capture_engine",
      "sources": [ 
        "addon.cpp",
        "CaptureManager.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "d3d11.lib",
        "dxgi.lib",
        "windowsapp.lib",
        "dwmapi.lib"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ 
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "WIN32_LEAN_AND_MEAN",
        "NOMINMAX"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": [ 
            "/std:c++17",
            "/permissive-"
          ]
        }
      }
    }
  ]
}
