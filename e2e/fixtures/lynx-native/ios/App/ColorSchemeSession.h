#import <Foundation/Foundation.h>

@protocol ColorSchemeDriver <NSObject>
- (BOOL)valid;
- (void)update:(NSString *)scheme;
- (void)barrier:(dispatch_block_t)callback;
- (void)flush;
- (void)post:(dispatch_block_t)callback;
- (void)later:(dispatch_block_t)callback;
@end

@interface ColorSchemeSession : NSObject
- (instancetype)initWithRunId:(NSString *)runId driver:(id<ColorSchemeDriver>)driver;
- (void)setRunId:(NSString *)runId requestId:(NSString *)requestId scheme:(NSString *)scheme
        callback:(void (^)(NSDictionary *))callback;
- (BOOL)isCurrentRunId:(NSString *)runId requestId:(NSString *)requestId;
- (void)invalidate;
@end
