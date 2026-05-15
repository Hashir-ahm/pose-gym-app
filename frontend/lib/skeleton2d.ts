// Shared 2D skeleton drawing utility
// Used by both dashboard and gym pages

export const BONES_2D = [
  [0,1],[1,2],[2,3],           // Right leg
  [0,4],[4,5],[5,6],           // Left leg
  [0,7],[7,8],[8,9],[9,10],    // Spine + head
  [8,11],[11,12],[12,13],      // Left arm
  [8,14],[14,15],[15,16],      // Right arm
];

export const BONE_COLORS_2D = [
  "#E74C3C","#E74C3C","#E74C3C",
  "#3498DB","#3498DB","#3498DB",
  "#2ECC71","#2ECC71","#2ECC71","#2ECC71",
  "#9B59B6","#9B59B6","#9B59B6",
  "#F39C12","#F39C12","#F39C12",
];

export function draw2DSkeleton(
  canvas: HTMLCanvasElement,
  joints2d: [number, number][],
  formStatus: "good" | "warning" | "error" = "good",
  displayW: number,
  displayH: number,
  captureW: number,
  captureH: number,
  mirrored: boolean = true,
) {
  canvas.width  = displayW;
  canvas.height = displayH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, displayW, displayH);

  // Scale from capture resolution to display resolution
  const scaleX = displayW / captureW;
  const scaleY = displayH / captureH;

  // X coordinate — mirror if video is displayed mirrored
  const tx = (x: number) => mirrored ? displayW - x * scaleX : x * scaleX;
  const ty = (y: number) => y * scaleY;

  const alpha = formStatus === "error" ? 1.0 : 0.85;

  // Draw bones
  BONES_2D.forEach(([a, b], i) => {
    if (!joints2d[a] || !joints2d[b]) return;
    ctx.beginPath();
    ctx.moveTo(tx(joints2d[a][0]), ty(joints2d[a][1]));
    ctx.lineTo(tx(joints2d[b][0]), ty(joints2d[b][1]));
    ctx.strokeStyle = BONE_COLORS_2D[i];
    ctx.lineWidth   = 3;
    ctx.globalAlpha = alpha;
    ctx.stroke();
  });

  // Draw joint dots
  joints2d.forEach(([x, y], i) => {
    const radius = i === 0 ? 7 : 5;
    const dx = tx(x);
    const dy = ty(y);

    // Coloured fill
    ctx.beginPath();
    ctx.arc(dx, dy, radius, 0, Math.PI * 2);
    ctx.fillStyle   = i === 0 ? "#ffffff" : "#00ff88";
    ctx.globalAlpha = alpha;
    ctx.fill();

    // Dark border for visibility
    ctx.beginPath();
    ctx.arc(dx, dy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 1.0;
    ctx.stroke();
  });

  ctx.globalAlpha = 1.0;
}

export function clearOverlay(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}
