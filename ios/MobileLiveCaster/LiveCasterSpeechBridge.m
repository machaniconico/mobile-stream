#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveCasterSpeech, NSObject)

RCT_EXTERN_METHOD(speak:(NSString *)text
                  rate:(nonnull NSNumber *)rate
                  pitch:(nonnull NSNumber *)pitch
                  volume:(nonnull NSNumber *)volume
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
