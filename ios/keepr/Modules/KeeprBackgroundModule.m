//
//  KeeprBackgroundModule.m
//  keepr
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KeeprBackgroundModule, NSObject)

RCT_EXTERN_METHOD(scheduleJob:(NSString *)jobId
                  type:(NSString *)type
                  payload:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancelJob:(NSString *)jobId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getJobStatus:(NSString *)jobId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
