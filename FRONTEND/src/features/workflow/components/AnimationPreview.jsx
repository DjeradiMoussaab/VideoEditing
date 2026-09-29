import { useCallback, useState } from "react";

export function AnimationPreview({ styleId, assetUrl, durationSec }) {
  const [ratio, setRatio] = useState(null);
  const measure = useCallback(image => {
    if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
      setRatio(image.naturalWidth / image.naturalHeight);
    }
  }, []);

  return (
    <div className="animation-thumb" data-style={styleId}
      data-ready={!assetUrl || ratio !== null}
      style={{ "--scene-animation-duration": `${Number(durationSec) > 0 ? Number(durationSec) : 5}s`, ...(ratio !== null ? { "--image-ratio": ratio } : {}) }}>
      <div className="animation-thumb-bg" style={assetUrl ? { backgroundImage: `url("${assetUrl}")` } : undefined} />
      <div className="animation-thumb-frame">
        {assetUrl && <img ref={measure} src={assetUrl} alt="" loading="lazy"
          onLoad={event => measure(event.currentTarget)} />}
      </div>
    </div>
  );
}
