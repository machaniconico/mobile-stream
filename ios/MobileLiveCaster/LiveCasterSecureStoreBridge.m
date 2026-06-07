#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveCasterSecureStore, NSObject)

RCT_EXTERN_METHOD(saveProfile:(NSString *)profileJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(loadProfile:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearProfile:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
