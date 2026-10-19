#import <UIKit/UIKit.h>

@interface CaptureScrollRecorder : NSObject
- (instancetype)initWithView:(UIView *)view directory:(NSURL *)directory context:(NSDictionary *)context
            durationSeconds:(NSTimeInterval)durationSeconds;
- (void)start;
@end
