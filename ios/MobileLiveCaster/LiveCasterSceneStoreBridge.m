#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveCasterSceneStore, NSObject)

RCT_EXTERN_METHOD(saveScene:(NSString *)sceneJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(loadScene:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearScene:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
