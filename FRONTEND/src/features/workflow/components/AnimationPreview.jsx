import { useCallback, useState } from "react";

export function AnimationPreview({ styleId, assetUrl }) {
  const [ratio, setRatio] = useState(null);
  const measure = useCallback(image => {
    if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
      setRatio(image.naturalWidth / image.naturalHeight);
    }
  }, []);

  return (
    <div className="animation-thumb" data-style={styleId}
      data-ready={!assetUrl || ratio !== null}
      style={ratio !== null ? { "--image-ratio": ratio } : undefined}>
      <div className="animation-thumb-bg" style={assetUrl ? { backgroundImage: `url("${assetUrl}")` } : undefined} />
      <div className="animation-thumb-frame">
        {assetUrl && <img ref={measure} src={assetUrl} alt="" loading="lazy"
          onLoad={event => measure(event.currentTarget)} />}
      </div>
    </div>
  );
}
