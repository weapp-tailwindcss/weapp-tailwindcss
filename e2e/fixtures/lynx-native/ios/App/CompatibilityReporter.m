#import "CompatibilityReporter.h"
#import <Lynx/LynxEvent.h>
#import <Lynx/LynxEventEmitter.h>
#import <Lynx/LynxUI.h>
#import <Lynx/LynxUIContext.h>
#import <Lynx/LynxView.h>

static __weak LynxView *compatibilityLynxView;

@implementation CompatibilityReporter
+ (void)setLynxView:(LynxView *)lynxView {
  compatibilityLynxView = lynxView;
}

+ (NSString *)name {
  return @"CompatibilityReporter";
}

+ (NSDictionary<NSString *, NSString *> *)methodLookup {
  return @{
    @"submit" : NSStringFromSelector(@selector(submit:)),
    @"submitArtifact" : NSStringFromSelector(@selector(submitArtifact:data:)),
    @"measure" : NSStringFromSelector(@selector(measure:callback:)),
    @"capture" : NSStringFromSelector(@selector(capture:callback:)),
    @"pointerEventsNone" : NSStringFromSelector(@selector(pointerEventsNone:callback:)),
    @"setPseudoActive" : NSStringFromSelector(@selector(setPseudoActive:active:callback:))
  };
}

- (void)measure:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    LynxUI *ui = [compatibilityLynxView uiWithIdSelector:identifier];
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
    LynxUI *ui = [compatibilityLynxView uiWithIdSelector:identifier];
    UIView *view = ui.view;
    if (view == nil || CGRectGetWidth(view.bounds) <= 0 || CGRectGetHeight(view.bounds) <= 0) {
      callback([NSNull null]);
      return;
    }
    UIGraphicsBeginImageContextWithOptions(view.bounds.size, NO, UIScreen.mainScreen.scale);
    // identifier 指向稳定父容器，保留子节点合成效果，并拒绝失败绘制产生的空白图。
    BOOL rendered = [view drawViewHierarchyInRect:view.bounds afterScreenUpdates:NO];
    UIImage *image = rendered ? UIGraphicsGetImageFromCurrentImageContext() : nil;
    UIGraphicsEndImageContext();
    NSData *data = image == nil ? nil : UIImagePNGRepresentation(image);
    callback(data == nil ? [NSNull null] : [data base64EncodedStringWithOptions:0]);
  });
}

- (void)pointerEventsNone:(NSString *)identifier callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    LynxUI *ui = [compatibilityLynxView uiWithIdSelector:identifier];
    callback(ui == nil ? [NSNull null] : @([ui pointerEvents] == kLynxPointerEventsValueNone));
  });
}

- (void)setPseudoActive:(NSString *)identifier active:(BOOL)active callback:(LynxCallbackBlock)callback {
  dispatch_async(dispatch_get_main_queue(), ^{
    LynxUI *ui = [compatibilityLynxView uiWithIdSelector:identifier];
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

- (void)submit:(NSString *)report {
  NSURL *directory = [[[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject];
  directory = [directory URLByAppendingPathComponent:@"lynx-compat" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
  NSURL *temporary = [directory URLByAppendingPathComponent:@"report.json.tmp"];
  NSURL *output = [directory URLByAppendingPathComponent:@"report.json"];
  [report writeToURL:temporary atomically:YES encoding:NSUTF8StringEncoding error:nil];
  [[NSFileManager defaultManager] removeItemAtURL:output error:nil];
  [[NSFileManager defaultManager] moveItemAtURL:temporary toURL:output error:nil];
}

- (void)submitArtifact:(NSString *)name data:(NSString *)source {
  NSCharacterSet *invalid = [[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyz0123456789-."] invertedSet];
  if ([name rangeOfCharacterFromSet:invalid].location != NSNotFound || ![name hasSuffix:@".png"]) {
    return;
  }
  NSRange separator = [source rangeOfString:@","];
  NSString *payload = separator.location == NSNotFound ? source : [source substringFromIndex:separator.location + 1];
  NSData *data = [[NSData alloc] initWithBase64EncodedString:payload options:NSDataBase64DecodingIgnoreUnknownCharacters];
  if (data == nil) {
    return;
  }
  NSURL *directory = [[[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject];
  directory = [directory URLByAppendingPathComponent:@"lynx-compat/artifacts" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
  [data writeToURL:[directory URLByAppendingPathComponent:name] options:NSDataWritingAtomic error:nil];
}
@end
