#import "CompatibilityReporter.h"
#import "EvidenceStore.h"
#import "GeometryEvidence.h"
#import "MediaGateEvidence.h"
#import "ColorSchemeSession.h"
#import "ResponsiveSession.h"
#import "ResponsiveEvidence.h"
#import "ReporterBinding.h"
#import <Lynx/LynxEvent.h>
#import <Lynx/LynxEventEmitter.h>
#import <Lynx/LynxUI.h>
#import <Lynx/LynxUIContext.h>
#import <Lynx/LynxView.h>
#import <Lynx/LynxVersion.h>
#import <math.h>

@implementation CompatibilityReporter {
  ReporterBinding *_binding;
}
- (instancetype)initWithParam:(id)param {
  self = [super init];
  if (self) {
    if (![param isKindOfClass:ReporterBinding.class]) return nil;
    _binding = param;
  }
  return self;
}

+ (NSString *)name {
  return @"CompatibilityReporter";
}

+ (NSDictionary<NSString *, NSString *> *)methodLookup {
  return @{
    @"getEvidenceContext" : NSStringFromSelector(@selector(getEvidenceContext:)),
    @"submit" : NSStringFromSelector(@selector(submit:report:callback:)),
    @"fail" : NSStringFromSelector(@selector(fail:message:callback:)),
    @"submitArtifact" : NSStringFromSelector(@selector(submitArtifact:name:data:callback:)),
    @"measure" : NSStringFromSelector(@selector(measure:callback:)),
    @"capture" : NSStringFromSelector(@selector(capture:callback:)),
    @"captureGeometry" : NSStringFromSelector(@selector(captureGeometry:identifier:callback:)),
    @"captureMediaGate" : NSStringFromSelector(@selector(captureMediaGate:callback:)),
    @"setColorScheme" : NSStringFromSelector(@selector(setColorScheme:requestId:scheme:callback:)),
    @"captureColorScheme" : NSStringFromSelector(@selector(captureColorScheme:requestId:identifier:callback:)),
    @"captureResponsive" : NSStringFromSelector(@selector(captureResponsive:requestId:phase:callback:)),
    @"pointerEventsNone" : NSStringFromSelector(@selector(pointerEventsNone:callback:)),
    @"setPseudoActive" : NSStringFromSelector(@selector(setPseudoActive:active:callback:))
  };
}

- (void)fail:(NSString *)runId message:(NSString *)message callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSError *error = nil;
    BOOL accepted = [_binding.store publishFailure:message runId:runId error:&error];
    if (!accepted) NSLog(@"Lynx evidence failure could not be persisted: %@", error);
    callback(@(accepted));
  });
}

// JS 尚未获取 runId 时也保存明确的宿主失效原因，节点缺失继续由各取证方法判定。
- (BOOL)requireView:(LynxCallbackBlock)callback {
  if (_binding.view != nil) return YES;
  NSDictionary *failure = @{@"version": @1, @"source": @"lynx-native-evidence", @"category": @"environment",
    @"code": @"view-expired", @"message": @"View binding expired"};
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:failure options:0 error:&error];
  NSString *message = data == nil ? nil : [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (message == nil || ![_binding.store publishFailure:message runId:_binding.store.context[@"runId"] error:&error]) {
    NSLog(@"Lynx expired view failure could not be persisted: %@", error);
  }
  callback(@{@"error": failure});
  return NO;
}

- (void)measure:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    LynxUI *ui = [_binding.view uiWithIdSelector:identifier];
    if (ui == nil) {
      callback([NSNull null]);
      return;
    }
    CGRect rect = [ui getBoundingClientRectToScreen];
    callback(@{
      @"left" : @(CGRectGetMinX(rect)),
      @"right" : @(CGRectGetMaxX(rect)),
      @"top" : @(CGRectGetMinY(rect)),
      @"bottom" : @(CGRectGetMaxY(rect)),
      @"width" : @(CGRectGetWidth(rect)),
      @"height" : @(CGRectGetHeight(rect))
    });
  });
}

- (void)capture:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self captureNow:identifier afterScreenUpdates:NO callback:callback];
  });
}

- (void)captureGeometry:(NSString *)runId identifier:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    GeometryEvidence *evidence = [[GeometryEvidence alloc] initWithStore:_binding.store];
    NSError *error = nil;
    NSDictionary *result = [evidence captureRunId:runId identifier:identifier measure:^NSDictionary *(NSString *node) {
      LynxUI *ui = [_binding.view uiWithIdSelector:node];
      if (ui == nil || ui.view == nil) return nil;
      CGRect rect = [ui getBoundingClientRectToScreen];
      return @{@"left": @(CGRectGetMinX(rect)), @"right": @(CGRectGetMaxX(rect)),
        @"top": @(CGRectGetMinY(rect)), @"bottom": @(CGRectGetMaxY(rect)),
        @"width": @(CGRectGetWidth(rect)), @"height": @(CGRectGetHeight(rect))};
    } capture:^NSData *(NSString *node) {
      return [self captureDataNow:node afterScreenUpdates:YES];
    } error:&error];
    if (result == nil) NSLog(@"Lynx native geometry evidence failed: %@", error);
    callback(result ?: [NSNull null]);
  });
}

- (void)captureMediaGate:(NSString *)runId callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    MediaGateEvidence *evidence = [[MediaGateEvidence alloc] initWithStore:_binding.store];
    NSError *error = nil;
    NSDictionary *result = [evidence captureRunId:runId sdkVersion:^NSString *{
      return [LynxVersion versionString];
    } measure:^NSDictionary *(NSString *node) {
      LynxUI *ui = [_binding.view uiWithIdSelector:node];
      if (ui == nil || ui.view == nil) return nil;
      CGRect rect = [ui getBoundingClientRectToScreen];
      return @{@"left": @(CGRectGetMinX(rect)), @"top": @(CGRectGetMinY(rect)),
        @"right": @(CGRectGetMaxX(rect)), @"bottom": @(CGRectGetMaxY(rect)),
        @"width": @(CGRectGetWidth(rect)), @"height": @(CGRectGetHeight(rect))};
    } capture:^NSData *(NSString *node) {
      return [self captureDataNow:node afterScreenUpdates:YES];
    } error:&error];
    if (result == nil) NSLog(@"Lynx native media evidence failed: %@", error);
    callback(result ?: [NSNull null]);
  });
}

- (void)captureResponsive:(NSString *)runId requestId:(NSString *)requestId phase:(NSString *)phase callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    if (_binding.responsive == nil) { callback([NSNull null]); return; }
    [_binding.responsive captureRunId:runId requestId:requestId phase:phase callback:^(NSDictionary *receipt) {
      if (receipt == nil) { callback([NSNull null]); return; }
      ResponsiveEvidence *evidence = [[ResponsiveEvidence alloc] initWithStore:_binding.store];
      NSError *error = nil;
      NSDictionary *result = [evidence captureReceipt:receipt measure:^NSDictionary *(NSString *node) {
        LynxUI *ui = [_binding.view uiWithIdSelector:node];
        if (ui == nil || ui.view == nil) return nil;
        CGRect rect = [ui getBoundingClientRectToScreen];
        return @{@"left": @(CGRectGetMinX(rect)), @"top": @(CGRectGetMinY(rect)), @"right": @(CGRectGetMaxX(rect)),
          @"bottom": @(CGRectGetMaxY(rect)), @"width": @(CGRectGetWidth(rect)), @"height": @(CGRectGetHeight(rect))};
      } capture:^NSData *(NSString *node) { return [self captureDataNow:node afterScreenUpdates:YES]; } error:&error];
      if (result == nil) NSLog(@"Lynx responsive capture failed: %@", error);
      callback(result ?: [NSNull null]);
    }];
  });
}

- (void)setColorScheme:(NSString *)runId requestId:(NSString *)requestId scheme:(NSString *)scheme callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    if (_binding.colorScheme == nil) { callback([NSNull null]); return; }
    [_binding.colorScheme setRunId:runId requestId:requestId scheme:scheme callback:^(NSDictionary *receipt) {
      callback(receipt ?: [NSNull null]);
    }];
  });
}

- (void)captureColorScheme:(NSString *)runId requestId:(NSString *)requestId identifier:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    if (![_binding.colorScheme isCurrentRunId:runId requestId:requestId]) { callback([NSNull null]); return; }
    [self captureNow:identifier afterScreenUpdates:YES callback:callback];
  });
}

- (void)captureNow:(NSString *)identifier afterScreenUpdates:(BOOL)updates callback:(LynxCallbackBlock)callback {
  if (![self requireView:callback]) return;
  NSData *data = [self captureDataNow:identifier afterScreenUpdates:updates];
  callback(data == nil ? [NSNull null] : [data base64EncodedStringWithOptions:0]);
}

- (NSData *)captureDataNow:(NSString *)identifier afterScreenUpdates:(BOOL)updates {
  LynxUI *ui = [_binding.view uiWithIdSelector:identifier];
  UIView *view = ui.view;
  if (view == nil || CGRectIsEmpty(view.bounds) || CGRectIsNull(view.bounds) || CGRectIsInfinite(view.bounds)
      || !isfinite(view.bounds.size.width) || !isfinite(view.bounds.size.height)) return nil;
  UIGraphicsBeginImageContextWithOptions(view.bounds.size, NO, UIScreen.mainScreen.scale);
  @try {
    // identifier 指向稳定父容器，保留子节点合成效果，并拒绝失败绘制产生的空白图。
    BOOL rendered = [view drawViewHierarchyInRect:view.bounds afterScreenUpdates:updates];
    UIImage *image = rendered ? UIGraphicsGetImageFromCurrentImageContext() : nil;
    return image == nil ? nil : UIImagePNGRepresentation(image);
  }
  @finally {
    UIGraphicsEndImageContext();
  }
}

- (void)pointerEventsNone:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    LynxUI *ui = [_binding.view uiWithIdSelector:identifier];
    callback(ui == nil ? [NSNull null] : @([ui pointerEvents] == kLynxPointerEventsValueNone));
  });
}

- (void)setPseudoActive:(NSString *)identifier active:(BOOL)active callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    LynxUI *ui = [_binding.view uiWithIdSelector:identifier];
    if (ui == nil) {
      callback(@NO);
      return;
    }
    int32_t previous = active ? LynxTouchPseudoStateNone : LynxTouchPseudoStateActive;
    int32_t current = active ? LynxTouchPseudoStateActive : LynxTouchPseudoStateNone;
    [ui onPseudoStatusFrom:previous changedTo:current];
    [ui.context.eventEmitter onPseudoStatusChanged:(int32_t)ui.sign
                                     fromPreStatus:previous
                                   toCurrentStatus:current];
    callback(@YES);
  });
}

- (void)getEvidenceContext:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    callback(_binding.store.context);
  });
}

- (void)submit:(NSString *)runId report:(NSString *)source callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    NSError *error = nil;
    NSDictionary *report = [NSJSONSerialization JSONObjectWithData:[source dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&error];
    BOOL accepted = [_binding.store publishReport:report runId:runId error:&error];
    if (!accepted) NSLog(@"Lynx evidence report failed: %@", error);
    callback(@(accepted));
  });
}

- (void)submitArtifact:(NSString *)runId name:(NSString *)name data:(NSString *)source callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self requireView:callback]) return;
    NSString *prefix = @"data:image/png;base64,";
    NSString *payload = [source hasPrefix:prefix] ? [source substringFromIndex:prefix.length] : source;
    NSData *data = [[NSData alloc] initWithBase64EncodedString:payload options:0];
    NSError *error = nil;
    NSDictionary *receipt = [_binding.store saveArtifact:name runId:runId data:data error:&error];
    if (receipt == nil) NSLog(@"Lynx evidence artifact failed: %@", error);
    callback(receipt ?: [NSNull null]);
  });
}
@end
