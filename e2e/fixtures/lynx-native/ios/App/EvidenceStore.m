#import "EvidenceStore.h"
#import <CommonCrypto/CommonDigest.h>

@interface EvidenceStore ()
@property(nonatomic) NSDictionary *context;
@property(nonatomic) NSURL *directory;
@property(nonatomic) NSMutableArray<NSDictionary *> *receipts;
@property(nonatomic) BOOL failed;
@property(nonatomic) BOOL published;
@end

@implementation EvidenceStore
+ (NSString *)sha256:(NSData *)data {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *result = [NSMutableString string];
  for (NSUInteger index = 0; index < CC_SHA256_DIGEST_LENGTH; index++) {
    [result appendFormat:@"%02x", digest[index]];
  }
  return result;
}

- (BOOL)reject:(NSString *)message error:(NSError **)error {
  self.failed = YES;
  if (error != NULL) {
    *error = [NSError errorWithDomain:@"LynxEvidence" code:1 userInfo:@{NSLocalizedDescriptionKey: message}];
  }
  return NO;
}

- (instancetype)initWithRoot:(NSURL *)root runId:(NSString *)runId bundle:(NSData *)bundle
                expectedSHA:(NSString *)expectedSHA error:(NSError **)error {
  self = [super init];
  if (self == nil) return nil;
  NSPredicate *valid = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"];
  if (runId == nil || ![valid evaluateWithObject:runId] || bundle.length == 0
      || ![[EvidenceStore sha256:bundle] isEqualToString:expectedSHA]) {
    [self reject:@"Invalid run ID or loaded bundle SHA-256" error:error];
    return nil;
  }
  self.context = @{@"version": @1, @"runId": runId, @"bundleSha256": [EvidenceStore sha256:bundle]};
  self.directory = [root URLByAppendingPathComponent:runId isDirectory:YES];
  self.receipts = [NSMutableArray array];
  NSFileManager *manager = NSFileManager.defaultManager;
  // 不覆盖已存在的同一 run，防止二次启动把旧帧混入新报告。
  if (![manager createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:error]
      || [manager fileExistsAtPath:self.directory.path]
      || ![manager createDirectoryAtURL:self.directory withIntermediateDirectories:NO attributes:nil error:error]
      || ![manager createDirectoryAtURL:[self.directory URLByAppendingPathComponent:@"artifacts"]
          withIntermediateDirectories:NO attributes:nil error:error]) {
    if (error != NULL && *error == nil) [self reject:@"Cannot create exclusive evidence directory" error:error];
    return nil;
  }
  return self;
}

- (BOOL)checkRun:(NSString *)runId error:(NSError **)error {
  if (self.failed || self.published || ![self.context[@"runId"] isEqualToString:runId]) {
    return [self reject:@"Evidence run is failed, published, or mismatched" error:error];
  }
  return YES;
}

- (BOOL)writeData:(NSData *)data to:(NSURL *)output error:(NSError **)error {
  NSURL *temporary = [output URLByAppendingPathExtension:@"tmp"];
  if (data == nil || ![data writeToURL:temporary options:NSDataWritingWithoutOverwriting error:error]
      || ![NSFileManager.defaultManager moveItemAtURL:temporary toURL:output error:error]) {
    self.failed = YES;
    return NO;
  }
  return YES;
}

- (NSDictionary *)saveArtifact:(NSString *)name runId:(NSString *)runId data:(NSData *)data error:(NSError **)error {
  @synchronized(self) {
    if (![self checkRun:runId error:error]) return nil;
    NSPredicate *valid = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"[a-z0-9-]+\\.png"];
    if (name == nil || ![valid evaluateWithObject:name] || data.length == 0) {
      [self reject:@"Invalid artifact payload" error:error];
      return nil;
    }
    NSURL *output = [[self.directory URLByAppendingPathComponent:@"artifacts"] URLByAppendingPathComponent:name];
    if (![self writeData:data to:output error:error]) return nil;
    NSDictionary *receipt = @{@"runId": runId, @"name": name, @"sha256": [EvidenceStore sha256:data], @"byteLength": @(data.length)};
    [self.receipts addObject:receipt];
    return receipt;
  }
}

- (BOOL)publishReport:(NSDictionary *)report runId:(NSString *)runId error:(NSError **)error {
  @synchronized(self) {
    if (![self checkRun:runId error:error]) return NO;
    if (![report isKindOfClass:NSDictionary.class]) return [self reject:@"Invalid report JSON" error:error];
    NSMutableDictionary *value = [report mutableCopy];
    NSMutableDictionary *evidence = [self.context mutableCopy];
    evidence[@"artifacts"] = [self.receipts copy];
    value[@"evidence"] = evidence;
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:error];
    if (![self writeData:data to:[self.directory URLByAppendingPathComponent:@"report.json"] error:error]) return NO;
    self.published = YES;
    return YES;
  }
}
@end
