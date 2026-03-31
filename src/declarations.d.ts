declare module "*.module.css" {
    const classes: { [key: string]: string };
    export default classes;
}
declare module "*.module.scss" {
    const classes: { [key: string]: string };
    export default classes;
}
declare module "*.mp3" {
    const src: string;
    export default src;
}
declare module "*.wav" {
    const src: string;
    export default src;
}
declare module "*.png" {
    const src: string;
    export default src;
}
declare module "*.jpg" {
    const src: string;
    export default src;
}
declare module "*.svg" {
    const src: string;
    export default src;
}
declare module "*.node" {
    const nativeModule: any;
    export default nativeModule;
}

interface Window {
    electronAPI: any;
    menuAPI: any;
    timerWidgetAPI: any;
    recordingWidgetAPI: any;
    videoEditorAPI?: any;
}
