package com.weapptailwindcss.lynxcompat;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import com.lynx.tasm.image.ImageContent;
import com.lynx.tasm.image.model.AnimationListener;
import com.lynx.tasm.image.model.ImageInfo;
import com.lynx.tasm.image.model.ImageLoadListener;
import com.lynx.tasm.image.model.ImageRequestInfo;
import com.lynx.tasm.image.model.LynxImageFetcher;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;

/** 宣传录制只解码随本轮 bundle 归档的本地位图。 */
public final class CaptureImageFetcher implements LynxImageFetcher {
  @Override
  public void loadImage(ImageRequestInfo request, ImageLoadListener listener, AnimationListener animation, Context context) {
    listener.onRequestSubmit(request);
    new Handler(Looper.getMainLooper()).post(() -> {
      try {
        Uri uri = Uri.parse(request.getUrl());
        String scheme = uri.getScheme();
        if (scheme != null && !scheme.equals("assets")) throw new IOException("Only archived local images are supported");
        String relative = uri.getPath() == null ? "" : uri.getPath();
        if ("assets".equals(scheme) && uri.getHost() != null && !uri.getHost().equals("main.lynx.bundle")) {
          relative = uri.getHost() + relative;
        }
        ArrayList<String> parts = new ArrayList<>();
        for (String part : relative.split("/")) {
          if (part.isEmpty()) continue;
          if (part.equals(".") || part.equals("..") || part.contains("\\")) throw new IOException("Invalid capture asset path");
          parts.add(part);
        }
        if (parts.isEmpty()) throw new IOException("Missing capture asset path");
        try (InputStream input = context.getAssets().open("capture-assets/" + String.join("/", parts))) {
          Bitmap bitmap = BitmapFactory.decodeStream(input);
          if (bitmap == null) throw new IOException("Unable to decode capture image");
          listener.onSuccess(new ImageContent(bitmap), request, new ImageInfo(bitmap.getWidth(), bitmap.getHeight(), false));
        }
      } catch (Exception error) {
        listener.onFailure(1, error);
      }
    });
  }

  @Override
  public void releaseImage(ImageRequestInfo request) {
    // 位图交给内置 Lynx ImageContent 管理，录制宿主不保留额外缓存。
  }
}
