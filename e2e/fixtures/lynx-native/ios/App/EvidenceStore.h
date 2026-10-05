#import <Foundation/Foundation.h>

@interface EvidenceStore : NSObject
@property(nonatomic, readonly) NSDictionary *context;
- (instancetype)initWithRoot:(NSURL *)root runId:(NSString *)runId bundle:(NSData *)bundle
                expectedSHA:(NSString *)expectedSHA error:(NSError **)error;
- (NSDictionary *)saveArtifact:(NSString *)name runId:(NSString *)runId data:(NSData *)data error:(NSError **)error;
- (BOOL)publishReport:(NSDictionary *)report runId:(NSString *)runId error:(NSError **)error;
+ (NSString *)sha256:(NSData *)data;
@end
