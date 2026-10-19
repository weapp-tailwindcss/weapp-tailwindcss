#import <Foundation/Foundation.h>
@class EvidenceStore;

typedef NSString *(^MediaGateVersionBlock)(void);
typedef NSDictionary *(^MediaGateMeasureBlock)(NSString *identifier);
typedef NSData *(^MediaGateCaptureBlock)(NSString *identifier);

@interface MediaGateEvidence : NSObject
- (instancetype)initWithStore:(EvidenceStore *)store;
- (NSDictionary *)captureRunId:(NSString *)runId sdkVersion:(MediaGateVersionBlock)sdkVersion
                      measure:(MediaGateMeasureBlock)measure capture:(MediaGateCaptureBlock)capture error:(NSError **)error;
@end
