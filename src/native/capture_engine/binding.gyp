{
  "targets": [
    {
      "target_name": "capture_engine",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ 
        "addon.cpp",
        "CaptureManager.cpp"
      ],
      "include_dirs": [
        "../../../node_modules/node-addon-api"
      ],
      "libraries": [
        "d3d11.lib",
        "dxgi.lib"
      ],
      "dependencies": [
        "../../../node_modules/node-addon-api/nothing.gyp:nothing"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    }
  ]
}
