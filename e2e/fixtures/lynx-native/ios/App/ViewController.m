#import "ViewController.h"
#import "CompatibilityReporter.h"
#import "EvidenceStore.h"
#import <Lynx/LynxConfig.h>
#import <Lynx/LynxEnv.h>
#import <Lynx/LynxView.h>

@implementation ViewController
- (void)viewDidLoad {
  [super viewDidLoad];
  LynxConfig *config = [[LynxConfig alloc] initWithProvider:nil];
  [config registerModule:CompatibilityReporter.class];
  [[LynxEnv sharedInstance] prepareConfig:config];
  LynxView *lynxView = [[LynxView alloc] initWithBuilderBlock:^(LynxViewBuilder *builder) {
    builder.config = config;
    builder.screenSize = UIScreen.mainScreen.bounds.size;
  }];
  [CompatibilityReporter setLynxView:lynxView];
  lynxView.frame = self.view.bounds;
  lynxView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  lynxView.preferredLayoutWidth = self.view.bounds.size.width;
  lynxView.preferredLayoutHeight = self.view.bounds.size.height;
  lynxView.layoutWidthMode = LynxViewSizeModeExact;
  lynxView.layoutHeightMode = LynxViewSizeModeExact;
  [self.view addSubview:lynxView];
  NSString *path = [NSBundle.mainBundle pathForResource:@"main.lynx" ofType:@"bundle"];
  NSData *data = [NSData dataWithContentsOfFile:path];
  NSError *error = nil;
  NSData *contextData = [NSData dataWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"run-context" ofType:@"json"]];
  NSDictionary *context = contextData == nil ? nil : [NSJSONSerialization JSONObjectWithData:contextData options:0 error:&error];
  NSURL *root = [[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject];
  EvidenceStore *store = [context[@"version"] isEqual:@1] ? [[EvidenceStore alloc]
    initWithRoot:[root URLByAppendingPathComponent:@"lynx-compat"] runId:context[@"runId"]
    bundle:data expectedSHA:context[@"bundleSha256"] error:&error] : nil;
  [CompatibilityReporter setEvidenceStore:store];
  if (store == nil) {
    NSLog(@"Lynx evidence initialization failed: %@", error);
    return;
  }
  [lynxView loadTemplate:data withURL:@"assets://main.lynx.bundle" initData:nil];
  [lynxView triggerLayout];
}
@end
