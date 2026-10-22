#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
@class LynxView;
@class EvidenceStore;
@class ColorSchemeSession;
@class ResponsiveSession;

@interface ReporterBinding : NSObject
@property(nonatomic, readonly) EvidenceStore *store;
@property(nonatomic, readonly) LynxView *view;
@property(nonatomic, readonly) ColorSchemeSession *colorScheme;
@property(nonatomic, readonly) ResponsiveSession *responsive;
@property(nonatomic, readonly) NSDictionary *screenMetrics;
- (instancetype)initWithStore:(EvidenceStore *)store;
- (void)attach:(LynxView *)view screenSize:(CGSize)screenSize pixelRatio:(CGFloat)pixelRatio;
- (void)invalidate;
@end
