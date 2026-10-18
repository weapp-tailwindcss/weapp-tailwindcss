#import "ViewController.h"
#import "CompatibilityReporter.h"
#import "EvidenceStore.h"
#import "ReporterBinding.h"
#import "CaptureScrollRecorder.h"
#import <Lynx/LynxConfig.h>
#import <Lynx/LynxEnv.h>
#import <Lynx/LynxView.h>
#import <Lynx/LynxImageFetcher.h>

@interface ViewController () <LynxImageFetcher>
@end

@implementation ViewController {
  ReporterBinding *_binding;
  CaptureScrollRecorder *_captureScroll;
}
- (void)viewDidLoad {
  [super viewDidLoad];
  [_binding invalidate];
  NSString *path = [NSBundle.mainBundle pathForResource:@"main.lynx" ofType:@"bundle"];
  NSData *data = [NSData dataWithContentsOfFile:path];
  NSError *error = nil;
  NSData *contextData = [NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"run-context" ofType:@"json"]];
  NSDictionary *context = contextData == nil ? nil : [NSJSONSerialization JSONObjectWithData:contextData options:0 error:&error];
  NSURL *root = [[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject];
  EvidenceStore *store = [context[@"version"] isEqual:@1] ? [[EvidenceStore alloc]
    initWithRoot:[root URLByAppendingPathComponent:@"lynx-compat"] runId:context[@"runId"]
    bundle:data expectedSHA:context[@"bundleSha256"] error:&error] : nil;
  if (store == nil) {
    NSLog(@"Lynx evidence initialization failed: %@", error);
    return;
  }
  _binding = [[ReporterBinding alloc] initWithStore:store];
  LynxConfig *config = [[LynxConfig alloc] initWithProvider:nil];
  [config registerModule:CompatibilityReporter.class param:_binding];
  [[LynxEnv sharedInstance] prepareConfig:config];
  LynxView *lynxView = [[LynxView alloc] initWithBuilderBlock:^(LynxViewBuilder *builder) {
    builder.config = config;
    builder.screenSize = UIScreen.mainScreen.bounds.size;
    [builder setThreadStrategyForRender:LynxThreadStrategyForRenderAllOnUI];
    builder.colorScheme = LynxColorSchemeLight;
  }];
  if ([context[@"captureAssets"] isEqual:@YES]) {
    lynxView.imageFetcher = self;
  }
  [_binding attach:lynxView];
  lynxView.frame = self.view.bounds;
  lynxView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  lynxView.preferredLayoutWidth = self.view.bounds.size.width;
  lynxView.preferredLayoutHeight = self.view.bounds.size.height;
  lynxView.layoutWidthMode = LynxViewSizeModeExact;
  lynxView.layoutHeightMode = LynxViewSizeModeExact;
  [self.view addSubview:lynxView];
  [lynxView loadTemplate:data withURL:@"assets://main.lynx.bundle" initData:nil];
  [lynxView triggerLayout];
  if ([context[@"captureScroll"] isEqual:@YES]) {
    NSURL *directory = [[root URLByAppendingPathComponent:@"lynx-compat"] URLByAppendingPathComponent:context[@"runId"]];
    _captureScroll = [[CaptureScrollRecorder alloc] initWithView:lynxView directory:directory context:store.context
      durationSeconds:[context[@"captureDurationSeconds"] doubleValue]];
    [_captureScroll start];
  }
}
- (dispatch_block_t)loadImageWithURL:(NSURL *)url size:(CGSize)targetSize
                       contextInfo:(NSDictionary *)contextInfo completion:(LynxImageLoadCompletionBlock)completion {
  NSString *scheme = url.scheme.lowercaseString;
  NSString *relative = url.path ?: @"";
  if ([scheme isEqualToString:@"assets"] && url.host.length > 0 && ![url.host isEqualToString:@"main.lynx.bundle"]) {
    relative = [url.host stringByAppendingString:relative];
  }
  BOOL valid = scheme.length == 0 || [scheme isEqualToString:@"assets"];
  NSMutableArray<NSString *> *components = [NSMutableArray new];
  for (NSString *part in [relative componentsSeparatedByString:@"/"]) {
    if (part.length == 0) continue;
    if ([part isEqualToString:@"."] || [part isEqualToString:@".."] || [part containsString:@"\\"]) valid = NO;
    [components addObject:part];
  }
  NSString *file = [NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"capture-assets"];
  for (NSString *component in components) file = [file stringByAppendingPathComponent:component];
  UIImage *image = valid && components.count > 0 ? [UIImage imageWithContentsOfFile:file] : nil;
  NSError *error = image == nil ? [NSError errorWithDomain:@"LynxCaptureAsset" code:1
    userInfo:@{NSLocalizedDescriptionKey: @"录制图片不是已归档的本地位图"}] : nil;
  dispatch_async(dispatch_get_main_queue(), ^{ completion(image, error, url); });
  return nil;
}
- (void)dealloc {
  ReporterBinding *binding = _binding;
  if (NSThread.isMainThread) {
    [binding invalidate];
  } else {
    dispatch_async(dispatch_get_main_queue(), ^{ [binding invalidate]; });
  }
}
@end
