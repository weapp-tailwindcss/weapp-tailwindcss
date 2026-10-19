#import <Foundation/Foundation.h>
#import "GeometryEvidence.h"
@class EvidenceStore;
@interface ResponsiveEvidence : NSObject
- (instancetype)initWithStore:(EvidenceStore *)store;
- (NSDictionary *)captureReceipt:(NSDictionary *)receipt measure:(GeometryMeasureBlock)measure capture:(GeometryCaptureBlock)capture error:(NSError **)error;
@end
