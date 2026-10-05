#import "CompatibilityReporter.h"
#import "EvidenceStore.h"
#import "ColorSchemeSession.h"
#import "ReporterBinding.h"
#import <Lynx/LynxEvent.h>
#import <Lynx/LynxEventEmitter.h>
#import <Lynx/LynxUI.h>
#import <Lynx/LynxUIContext.h>
#import <Lynx/LynxView.h>

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
    @"submitArtifact" : NSStringFromSelector(@selector(submitArtifact:name:data:callback:)),
    @"measure" : NSStringFromSelector(@selector(measure:callback:)),
    @"capture" : NSStringFromSelector(@selector(capture:callback:)),
    @"setColorScheme" : NSStringFromSelector(@selector(setColorScheme:requestId:scheme:callback:)),
    @"captureColorScheme" : NSStringFromSelector(@selector(captureColorScheme:requestId:identifier:callback:)),
    @"pointerEventsNone" : NSStringFromSelector(@selector(pointerEventsNone:callback:)),
    @"setPseudoActive" : NSStringFromSelector(@selector(setPseudoActive:active:callback:))
  };
}

- (void)measure:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
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

- (void)setColorScheme:(NSString *)runId requestId:(NSString *)requestId scheme:(NSString *)scheme callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (_binding.colorScheme == nil) { callback([NSNull null]); return; }
    [_binding.colorScheme setRunId:runId requestId:requestId scheme:scheme callback:^(NSDictionary *receipt) {
      callback(receipt ?: [NSNull null]);
    }];
  });
}

- (void)captureColorScheme:(NSString *)runId requestId:(NSString *)requestId identifier:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![_binding.colorScheme isCurrentRunId:runId requestId:requestId]) { callback([NSNull null]); return; }
    [self captureNow:identifier afterScreenUpdates:YES callback:callback];
  });
}

- (void)captureNow:(NSString *)identifier afterScreenUpdates:(BOOL)updates callback:(LynxCallbackBlock)callback {
  LynxUI *ui = [_binding.view uiWithIdSelector:identifier];
  UIView *view = ui.view;
  if (view == nil || CGRectGetWidth(view.bounds) <= 0 || CGRectGetHeight(view.bounds) <= 0) {
    callback([NSNull null]);
    return;
  }
  UIGraphicsBeginImageContextWithOptions(view.bounds.size, NO, UIScreen.mainScreen.scale);
  // identifier 指向稳定父容器，保留子节点合成效果，并拒绝失败绘制产生的空白图。
  BOOL rendered = [view drawViewHierarchyInRect:view.bounds afterScreenUpdates:updates];
  UIImage *image = rendered ? UIGraphicsGetImageFromCurrentImageContext() : nil;
  UIGraphicsEndImageContext();
  NSData *data = image == nil ? nil : UIImagePNGRepresentation(image);
  callback(data == nil ? [NSNull null] : [data base64EncodedStringWithOptions:0]);
}

- (void)pointerEventsNone:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    LynxUI *ui = [_binding.view uiWithIdSelector:identifier];
    callback(ui == nil ? [NSNull null] : @([ui pointerEvents] == kLynxPointerEventsValueNone));
  });
}

- (void)setPseudoActive:(NSString *)identifier active:(BOOL)active callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
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
    callback(_binding.view == nil ? [NSNull null] : _binding.store.context);
  });
}

- (void)submit:(NSString *)runId report:(NSString *)source callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (_binding.view == nil) { callback([NSNull null]); return; }
    NSError *error = nil;
    NSDictionary *report = [NSJSONSerialization JSONObjectWithData:[source dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&error];
    BOOL accepted = [_binding.store publishReport:report runId:runId error:&error];
    if (!accepted) NSLog(@"Lynx evidence report failed: %@", error);
    callback(@(accepted));
  });
}

- (void)submitArtifact:(NSString *)runId name:(NSString *)name data:(NSString *)source callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *prefix = @"data:image/png;base64,";
    NSString *payload = [source hasPrefix:prefix] ? [source substringFromIndex:prefix.length] : source;
    NSData *data = [[NSData alloc] initWithBase64EncodedString:payload options:0];
    if (_binding.view == nil) { callback([NSNull null]); return; }
    NSError *error = nil;
    NSDictionary *receipt = [_binding.store saveArtifact:name runId:runId data:data error:&error];
    if (receipt == nil) NSLog(@"Lynx evidence artifact failed: %@", error);
    callback(receipt ?: [NSNull null]);
  });
}
@end
