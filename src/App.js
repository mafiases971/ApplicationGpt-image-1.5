import { useState, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";

const PROVIDERS = [
  {
    id: "google",
    name: "Google Gemini 🍌",
    icon: "🔵",
    placeholder: "AIza...",
    color: "#4285F4",
  },
  {
    id: "grok",
    name: "Grok / xAI",
    icon: "⚫",
    placeholder: "xai-...",
    color: "#ffffff",
  },
  {
    id: "openai",
    name: "OpenAI GPT Image",
    icon: "🟠",
    placeholder: "sk-...",
    color: "#10a37f",
  },
];

const STYLES = [
  { id: "realistic", label: "Réaliste", emoji: "📷" },
  { id: "anime", label: "Anime", emoji: "🎌" },
  { id: "watercolor", label: "Aquarelle", emoji: "🎨" },
  { id: "cyberpunk", label: "Cyberpunk", emoji: "🤖" },
  { id: "oilpainting", label: "Peinture à l'huile", emoji: "🖼️" },
  { id: "sketch", label: "Croquis", emoji: "✏️" },
  { id: "fantasy", label: "Fantasy", emoji: "🧙" },
  { id: "minimalist", label: "Minimaliste", emoji: "⬜" },
];

// Dimensions adaptées par provider
const DIMENSIONS_OPENAI = [
  { id: "1:1", label: "1:1", w: 1024, h: 1024 },
  { id: "16:9", label: "16:9", w: 1536, h: 1024 },
  { id: "9:16", label: "9:16", w: 1024, h: 1536 },
  { id: "4:3", label: "4:3", w: 1280, h: 960 },
];

const DIMENSIONS_GOOGLE = [
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "4:3", label: "4:3" },
];

const DIMENSIONS_GROK = [
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
];

const LS_KEY = "ai_image_dashboard_v2";

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {}
}

export default function App() {
  const cfg = loadConfig();
  const [provider, setProvider] = useState(cfg.provider || "openai");
  const [apiKey, setApiKey] = useState(cfg.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [negPrompt, setNegPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [dimension, setDimension] = useState("1:1");
  const [loading, setLoading] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [history, setHistory] = useState(cfg.history || []);
  const [error, setError] = useState("");
  const [configOpen, setConfigOpen] = useState(!cfg.apiKey);
  const [lightbox, setLightbox] = useState(null);

  const currentProvider = PROVIDERS.find((p) => p.id === provider);

  const getDimensions = () => {
    if (provider === "openai") return DIMENSIONS_OPENAI;
    if (provider === "google") return DIMENSIONS_GOOGLE;
    return DIMENSIONS_GROK;
  };

  useEffect(() => {
    // Reset dimension si pas dispo pour ce provider
    const dims = getDimensions();
    if (!dims.find((d) => d.id === dimension)) setDimension("1:1");
  }, [provider]);

  useEffect(() => {
    saveConfig({ provider, apiKey, history });
  }, [provider, apiKey, history]);

  async function generate() {
    if (!prompt.trim()) {
      setError("Veuillez entrer un prompt.");
      return;
    }
    if (!apiKey.trim()) {
      setError("Veuillez entrer votre clé API.");
      return;
    }
    setError("");
    setLoading(true);

    const selectedStyle = STYLES.find((s) => s.id === style);
    const fullPrompt = `${prompt}, style: ${selectedStyle.label}${
      negPrompt ? `. Avoid: ${negPrompt}` : ""
    }`;

    try {
      let imageUrl = null;

      if (provider === "openai") {
        const dim = DIMENSIONS_OPENAI.find((d) => d.id === dimension);
        const res = await fetch(
          "https://api.openai.com/v1/images/generations",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-image-1.5",
              prompt: fullPrompt,
              n: 1,
              size: `${dim.w}x${dim.h}`,
              output_format: "png",
            }),
          }
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        // gpt-image-1.5 retourne du base64
        const b64 = data.data[0].b64_json;
        imageUrl = `data:image/png;base64,${b64}`;
      } else if (provider === "google") {
        // Nano Banana 2 via SDK officiel @google/genai (évite les erreurs CORS)
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: fullPrompt,
          config: { responseModalities: ["IMAGE", "TEXT"] },
        });
        const imgPart = response.candidates?.[0]?.content?.parts?.find(
          (p) => p.inlineData
        );
        if (!imgPart) throw new Error("Aucune image retournée par Gemini.");
        imageUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
      } else if (provider === "grok") {
        const res = await fetch("https://api.x.ai/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "grok-2-aurora",
            prompt: fullPrompt,
            n: 1,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || "Erreur Grok");
        imageUrl = data.data[0].url;
      }

      if (imageUrl) {
        const entry = {
          id: Date.now(),
          url: imageUrl,
          prompt,
          style,
          dimension,
          provider,
          ts: new Date().toLocaleTimeString(),
        };
        setCurrentImage(entry);
        setHistory((h) => [entry, ...h].slice(0, 20));
      }
    } catch (e) {
      setError(e.message || "Erreur lors de la génération.");
    } finally {
      setLoading(false);
    }
  }

  const dims = getDimensions();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f13",
        color: "#e2e8f0",
        fontFamily: "'Inter',sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.92)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightbox}
            alt="Aperçu"
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: 12,
              boxShadow: "0 0 60px rgba(124,58,237,.4)",
            }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: "absolute",
              top: 20,
              right: 24,
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: 28,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          background: "#16161e",
          borderBottom: "1px solid #2d2d3a",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🎨</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 18,
              background: "linear-gradient(135deg,#a78bfa,#60a5fa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AI Image Studio
          </span>
        </div>
        <button
          onClick={() => setConfigOpen((o) => !o)}
          style={{
            background: configOpen ? "#7c3aed" : "#2d2d3a",
            border: "none",
            color: "#e2e8f0",
            padding: "6px 14px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ⚙️ Configuration {configOpen ? "▲" : "▼"}
        </button>
      </div>

      {/* Config Panel */}
      {configOpen && (
        <div
          style={{
            background: "#1a1a24",
            borderBottom: "1px solid #2d2d3a",
            padding: "16px 24px",
          }}
        >
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
              🔑 Sélectionnez votre fournisseur et entrez votre clé API
            </p>
            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 14,
                flexWrap: "wrap",
              }}
            >
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  style={{
                    background: provider === p.id ? "#2d2d4a" : "#16161e",
                    border: `2px solid ${
                      provider === p.id ? p.color : "#2d2d3a"
                    }`,
                    color: "#e2e8f0",
                    padding: "8px 16px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Clé API ${currentProvider.name} (${currentProvider.placeholder})`}
                style={{
                  flex: 1,
                  background: "#0f0f13",
                  border: "1px solid #2d2d3a",
                  color: "#e2e8f0",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <button
                onClick={() => setShowKey((s) => !s)}
                style={{
                  background: "#2d2d3a",
                  border: "none",
                  color: "#94a3b8",
                  padding: "10px 14px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {showKey ? "🙈" : "👁️"}
              </button>
              <button
                onClick={() => {
                  saveConfig({ provider, apiKey, history });
                  setConfigOpen(false);
                }}
                style={{
                  background: "#7c3aed",
                  border: "none",
                  color: "#fff",
                  padding: "10px 18px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Sauvegarder
              </button>
            </div>
            {apiKey && (
              <p style={{ fontSize: 12, color: "#4ade80", marginTop: 8 }}>
                ✅ Clé sauvegardée pour {currentProvider.name}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ display: "flex", flex: 1 }}>
        {/* Left Panel */}
        <div
          style={{
            width: 320,
            background: "#16161e",
            borderRight: "1px solid #2d2d3a",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            overflowY: "auto",
          }}
        >
          <div>
            <label
              style={{
                fontSize: 12,
                color: "#94a3b8",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décrivez l'image souhaitée..."
              rows={4}
              style={{
                width: "100%",
                marginTop: 8,
                background: "#0f0f13",
                border: "1px solid #2d2d3a",
                color: "#e2e8f0",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 13,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <textarea
              value={negPrompt}
              onChange={(e) => setNegPrompt(e.target.value)}
              placeholder="Prompt négatif (optionnel)..."
              rows={2}
              style={{
                width: "100%",
                marginTop: 6,
                background: "#0f0f13",
                border: "1px solid #3d1a1a",
                color: "#f87171",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: 12,
                color: "#94a3b8",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Style artistique
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginTop: 8,
              }}
            >
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  style={{
                    background: style === s.id ? "#2d1a4a" : "#0f0f13",
                    border: `1px solid ${
                      style === s.id ? "#7c3aed" : "#2d2d3a"
                    }`,
                    color: style === s.id ? "#a78bfa" : "#94a3b8",
                    padding: "7px 8px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              style={{
                fontSize: 12,
                color: "#94a3b8",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Dimensions
            </label>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              {dims.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDimension(d.id)}
                  style={{
                    background: dimension === d.id ? "#1a2a4a" : "#0f0f13",
                    border: `1px solid ${
                      dimension === d.id ? "#60a5fa" : "#2d2d3a"
                    }`,
                    color: dimension === d.id ? "#60a5fa" : "#94a3b8",
                    padding: "6px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {provider === "openai" && (
              <p style={{ fontSize: 11, color: "#4a4a6a", marginTop: 6 }}>
                ⚠️ DALL·E 3 supporte uniquement 1:1, 16:9 et 9:16
              </p>
            )}
          </div>

          {error && (
            <p
              style={{
                background: "#2d1a1a",
                border: "1px solid #7f1d1d",
                color: "#f87171",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <button
            onClick={generate}
            disabled={loading}
            style={{
              background: loading
                ? "#3d2d5a"
                : "linear-gradient(135deg,#7c3aed,#3b82f6)",
              border: "none",
              color: "#fff",
              padding: 13,
              borderRadius: 10,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    animation: "spin 1s linear infinite",
                  }}
                >
                  ⟳
                </span>{" "}
                Génération...
              </>
            ) : (
              "✨ Générer"
            )}
          </button>
        </div>

        {/* Center */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#0f0f13",
          }}
        >
          {currentImage ? (
            <div style={{ maxWidth: 600, width: "100%", textAlign: "center" }}>
              <div
                style={{ position: "relative", cursor: "zoom-in" }}
                onClick={() => setLightbox(currentImage.url)}
              >
                <img
                  src={currentImage.url}
                  alt="Generated"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid #2d2d3a",
                    boxShadow: "0 0 40px rgba(124,58,237,.2)",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 12,
                    background: "rgba(0,0,0,0)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background .2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(0,0,0,.3)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "rgba(0,0,0,0)")
                  }
                >
                  <span style={{ fontSize: 36, opacity: 0.8 }}>🔍</span>
                </div>
              </div>
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 10,
                  justifyContent: "center",
                }}
              >
                <a
                  href={currentImage.url}
                  download="generated.png"
                  style={{
                    background: "#16161e",
                    border: "1px solid #2d2d3a",
                    color: "#e2e8f0",
                    padding: "8px 16px",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontSize: 13,
                  }}
                >
                  ⬇️ Télécharger
                </a>
                <button
                  onClick={() => setPrompt(currentImage.prompt)}
                  style={{
                    background: "#16161e",
                    border: "1px solid #2d2d3a",
                    color: "#e2e8f0",
                    padding: "8px 16px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  ♻️ Réutiliser le prompt
                </button>
                <button
                  onClick={() => setLightbox(currentImage.url)}
                  style={{
                    background: "#16161e",
                    border: "1px solid #2d2d3a",
                    color: "#e2e8f0",
                    padding: "8px 16px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  🔍 Agrandir
                </button>
              </div>
              <p style={{ color: "#4a4a6a", fontSize: 12, marginTop: 10 }}>
                {currentImage.prompt} • {currentImage.dimension} •{" "}
                {currentImage.ts}
              </p>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#2d2d4a" }}>
              <div style={{ fontSize: 64 }}>🖼️</div>
              <p style={{ marginTop: 16, fontSize: 16 }}>
                Votre image apparaîtra ici
              </p>
              <p style={{ fontSize: 13, marginTop: 6 }}>
                Configurez votre clé API et entrez un prompt pour commencer
              </p>
            </div>
          )}
        </div>

        {/* Right — History */}
        <div
          style={{
            width: 220,
            background: "#16161e",
            borderLeft: "1px solid #2d2d3a",
            padding: 16,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "#94a3b8",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Historique
            </span>
            {history.length > 0 && (
              <button
                onClick={() => {
                  setHistory([]);
                  saveConfig({ provider, apiKey, history: [] });
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4a4a6a",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Effacer
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p
              style={{
                color: "#2d2d4a",
                fontSize: 12,
                textAlign: "center",
                marginTop: 40,
              }}
            >
              Aucune image générée
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 8,
                    overflow: "hidden",
                    border:
                      currentImage?.id === item.id
                        ? "2px solid #7c3aed"
                        : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{ position: "relative" }}
                    onClick={() => setCurrentImage(item)}
                  >
                    <img
                      src={item.url}
                      alt=""
                      style={{ width: "100%", display: "block" }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightbox(item.url);
                      }}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: "rgba(0,0,0,.6)",
                        border: "none",
                        color: "#fff",
                        borderRadius: 6,
                        padding: "2px 6px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      🔍
                    </button>
                  </div>
                  <div style={{ background: "#0f0f13", padding: "4px 6px" }}>
                    <p
                      style={{
                        fontSize: 10,
                        color: "#4a4a6a",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.prompt}
                    </p>
                    <p style={{ fontSize: 10, color: "#2d2d4a", margin: 0 }}>
                      {item.ts}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
    </div>
  );
}
