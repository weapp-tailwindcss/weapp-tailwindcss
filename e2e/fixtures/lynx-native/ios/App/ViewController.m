#import "ViewController.h"
#import "CompatibilityReporter.h"
#import "EvidenceStore.h"
#import "ReporterBinding.h"
#import <Lynx/LynxConfig.h>
#import <Lynx/LynxEnv.h>
#import <Lynx/LynxView.h>

@implementation ViewController {
  ReporterBinding *_binding;
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
