#import <Foundation/Foundation.h>

@protocol ResponsiveDriver <NSObject>
- (BOOL)valid;
- (void)remember;
- (void)resizeWidth:(double)width height:(double)height;
- (void)restore;
- (NSDictionary *)viewport;
- (NSDictionary *)threshold;
- (void)barrier:(dispatch_block_t)callback;
- (void)flush;
- (void)frame:(dispatch_block_t)callback;
- (void)post:(dispatch_block_t)callback;
- (void)later:(dispatch_block_t)callback;
@end

@interface ResponsiveSession : NSObject
- (instancetype)initWithRunId:(NSString *)runId driver:(id<ResponsiveDriver>)driver;
- (void)captureRunId:(NSString *)runId requestId:(NSString *)requestId phase:(NSString *)phase callback:(void (^)(NSDictionary *))callback;
- (void)invalidate;
@end
