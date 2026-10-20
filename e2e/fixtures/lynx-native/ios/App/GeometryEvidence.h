#import <Foundation/Foundation.h>
@class EvidenceStore;

typedef NSDictionary *(^GeometryMeasureBlock)(NSString *identifier);
typedef NSData *(^GeometryCaptureBlock)(NSString *identifier);

@interface GeometryEvidence : NSObject
- (instancetype)initWithStore:(EvidenceStore *)store;
- (NSDictionary *)captureRunId:(NSString *)runId identifier:(NSString *)identifier
                      measure:(GeometryMeasureBlock)measure capture:(GeometryCaptureBlock)capture error:(NSError **)error;
@end
