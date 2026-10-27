//
//  KeeprCommitModule.m
//  keepr
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KeeprCommitModule, NSObject)

RCT_EXTERN_METHOD(commitBatch:(NSArray *)items
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(canTrash:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPlatformRecoveryDescription:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
