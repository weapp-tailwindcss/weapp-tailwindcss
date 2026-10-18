#import "CaptureScrollRecorder.h"

@implementation CaptureScrollRecorder {
  __weak UIView *_root;
  __weak UIScrollView *_scroll;
  NSURL *_output;
  NSMutableDictionary *_evidence;
  NSTimeInterval _startUptime;
  NSTimeInterval _durationSeconds;
}

- (instancetype)initWithView:(UIView *)view directory:(NSURL *)directory context:(NSDictionary *)context
            durationSeconds:(NSTimeInterval)durationSeconds {
  self = [super init];
  if (self == nil) return nil;
  _root = view;
  _output = [directory URLByAppendingPathComponent:@"capture-scroll.json"];
  _evidence = [context mutableCopy];
  _durationSeconds = durationSeconds;
  return self;
}

- (NSString *)timestamp {
  return [[NSISO8601DateFormatter new] stringFromDate:NSDate.date];
}

- (NSNumber *)elapsed {
  return @(NSProcessInfo.processInfo.systemUptime - _startUptime);
}

- (void)write {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:_evidence options:NSJSONWritingPrettyPrinted error:&error];
  if (data == nil || ![data writeToURL:_output options:NSDataWritingAtomic error:&error]) {
    NSLog(@"Lynx capture scroll evidence failed: %@", error);
  }
}

- (CGFloat)range:(UIScrollView *)scroll {
  return MAX(0, scroll.contentSize.height - scroll.bounds.size.height
    + scroll.adjustedContentInset.top + scroll.adjustedContentInset.bottom);
}

- (UIScrollView *)findScroll:(UIView *)view {
  UIScrollView *selected = [view isKindOfClass:UIScrollView.class] ? (UIScrollView *)view : nil;
  for (UIView *child in view.subviews) {
    UIScrollView *candidate = [self findScroll:child];
    if (candidate != nil && (selected == nil || [self range:candidate] > [self range:selected])) {
      selected = candidate;
    }
  }
  return selected;
}

- (void)scrollDown {
  _scroll = [self findScroll:_root];
  CGFloat range = _scroll == nil ? 0 : [self range:_scroll];
  _evidence[@"scrollRange"] = @(range);
  _evidence[@"scrollStartedAt"] = [self timestamp];
  _evidence[@"scrollStartedSeconds"] = [self elapsed];
  if (_scroll == nil || range <= 0) {
    _evidence[@"error"] = @"没有找到具有有效纵向滚动范围的 UIScrollView";
    [self write];
    return;
  }
  CGFloat minimum = -_scroll.adjustedContentInset.top;
  CGFloat target = MIN(minimum + range, _scroll.contentOffset.y + 350);
  _evidence[@"scrollViewClass"] = NSStringFromClass(_scroll.class);
  _evidence[@"minimumOffset"] = @(minimum);
  _evidence[@"beforeOffset"] = @(_scroll.contentOffset.y);
  _evidence[@"targetOffset"] = @(target);
  [_scroll setContentOffset:CGPointMake(_scroll.contentOffset.x, target) animated:YES];
  [self write];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.9 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    self->_evidence[@"afterOffset"] = @(self->_scroll.contentOffset.y);
    self->_evidence[@"afterAt"] = [self timestamp];
    self->_evidence[@"afterSeconds"] = [self elapsed];
    [self write];
  });
}

- (void)returnToTop {
  if (_scroll == nil || _evidence[@"error"] != nil) return;
  _evidence[@"returnStartedAt"] = [self timestamp];
  _evidence[@"returnStartedSeconds"] = [self elapsed];
  [_scroll setContentOffset:CGPointMake(_scroll.contentOffset.x, -_scroll.adjustedContentInset.top) animated:YES];
  [self write];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.9 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    self->_evidence[@"returnedOffset"] = @(self->_scroll.contentOffset.y);
    self->_evidence[@"completedAt"] = [self timestamp];
    self->_evidence[@"completedSeconds"] = [self elapsed];
    [self write];
  });
}

- (void)start {
  _startUptime = NSProcessInfo.processInfo.systemUptime;
  _evidence[@"startedAt"] = [self timestamp];
  if (!isfinite(_durationSeconds) || _durationSeconds < 8 || _durationSeconds > 180) {
    _evidence[@"error"] = @"原生滚动录制缺少有效的本轮 captureDurationSeconds";
    [self write];
    return;
  }
  _evidence[@"captureDurationSeconds"] = @(_durationSeconds);
  [self write];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(4.8 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [self scrollDown]; });
  // 末尾保留真实原生运动，避免可变帧率录屏提前结束于静止画面。
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((_durationSeconds - 0.5) * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [self returnToTop]; });
}
@end
