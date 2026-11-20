const figure = document.querySelector("#trace-viewer");
const panel = figure.querySelector(".trace-interactive");
const scene = figure.querySelector("#pendulum-scene");
const chart = figure.querySelector("#pendulum-chart");
const slider = figure.querySelector("#trace-time");
const playButton = figure.querySelector("#trace-play");
const angleReadout = figure.querySelector("#trace-angle");
const timeReadout = figure.querySelector("#trace-clock");
const statusReadout = figure.querySelector("#trace-status");

const limit = 0.2;
const palette = {
  text: "#acbac9",
  grid: "#263749",
  trace: "#9ce9db",
  subdued: "#548780",
  limit: "#f2a781",
  track: "#52677c",
};

function canvasFrame(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function segment(context, x1, y1, x2, y2, color, weight = 1) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.strokeStyle = color;
  context.lineWidth = weight;
  context.stroke();
}

function point(context, x, y, radius, color) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function drawScene(angle) {
  const { context, width, height } = canvasFrame(scene);
  if (!width || !height) return;

  const pivotX = width * 0.49;
  const pivotY = height * 0.81;
  const arm = Math.min(height * 0.64, width * 0.36);
  const endpoint = radians => [
    pivotX + Math.sin(radians) * arm,
    pivotY - Math.cos(radians) * arm,
  ];

  context.save();
  context.setLineDash([3, 5]);
  segment(context, pivotX, pivotY, pivotX, pivotY - arm - 10, palette.grid);
  for (const bound of [-limit, limit]) {
    const [x, y] = endpoint(bound);
    segment(context, pivotX, pivotY, x, y, "rgba(242,167,129,.52)");
  }
  context.restore();

  context.beginPath();
  context.arc(pivotX, pivotY, arm, -Math.PI / 2 - 0.78, -Math.PI / 2 + 0.78);
  context.strokeStyle = palette.grid;
  context.lineWidth = 1;
  context.stroke();
  for (let tick = -4; tick <= 4; tick += 1) {
    const radians = tick * 0.18;
    const [x, y] = endpoint(radians);
    segment(context, x, y, x + 5 * Math.sin(radians), y - 5 * Math.cos(radians), palette.track);
  }

  const railWidth = Math.min(width * 0.61, 360);
  const left = pivotX - railWidth / 2;
  const right = pivotX + railWidth / 2;
  segment(context, left, pivotY + 16, right, pivotY + 16, palette.track);
  for (let i = 0; i < 29; i += 1) {
    const x = left + i * railWidth / 28;
    segment(context, x, pivotY + 16, x, pivotY + (i % 4 === 0 ? 24 : 21), palette.grid);
  }

  context.fillStyle = "#263b50";
  context.fillRect(pivotX - 33, pivotY + 4, 66, 11);
  context.fillStyle = "#5d768b";
  context.fillRect(pivotX - 33, pivotY + 4, 66, 1);

  const [x, y] = endpoint(angle);
  const armColor = Math.abs(angle) >= limit ? palette.limit : palette.trace;
  context.save();
  context.shadowColor = armColor;
  context.shadowBlur = 15;
  segment(context, pivotX, pivotY, x, y, armColor, 3.5);
  point(context, x, y, 6, armColor);
  context.restore();
  point(context, pivotX, pivotY, 8, "#5c758a");
  point(context, pivotX, pivotY, 4, "#101a27");
}

function drawChart(angles, dt, time, angle) {
  const { context, width, height } = canvasFrame(chart);
  if (!width || !height) return;

  const duration = (angles.length - 1) * dt;
  const left = 41;
  const right = width - 13;
  const top = 14;
  const bottom = height - 25;
  const x = value => left + (right - left) * value / duration;
  const y = value => bottom - (bottom - top) * (value + 0.036) / 0.361;

  context.font = '11px "IBM Plex Mono", monospace';
  context.textBaseline = "middle";
  for (const value of [0, 0.1, 0.2, 0.3]) {
    const ruleY = y(value);
    if (value === limit) context.setLineDash([5, 4]);
    segment(context, left, ruleY, right, ruleY, value === limit ? palette.limit : palette.grid);
    context.setLineDash([]);
    context.fillStyle = value === limit ? palette.limit : palette.text;
    context.textAlign = "right";
    context.fillText(value.toFixed(1), left - 8, ruleY);
  }
  for (let second = 0; second <= duration; second += 1) {
    segment(context, x(second), top, x(second), bottom, palette.grid);
    context.fillStyle = palette.text;
    context.textAlign = "center";
    context.fillText(second === duration ? second + "s" : String(second), x(second), height - 10);
  }

  context.fillStyle = "rgba(242,167,129,.1)";
  context.fillRect(x(1), top, x(1.5) - x(1), bottom - top);

  const sample = Math.floor(time / dt);
  const pathTo = last => {
    context.beginPath();
    context.moveTo(x(0), y(angles[0]));
    for (let i = 1; i <= last; i += 1) context.lineTo(x(i * dt), y(angles[i]));
  };
  pathTo(angles.length - 1);
  context.lineWidth = 1.45;
  context.strokeStyle = palette.subdued;
  context.stroke();
  pathTo(sample);
  context.lineTo(x(time), y(angle));
  context.lineWidth = 2;
  context.strokeStyle = palette.trace;
  context.stroke();
  segment(context, x(time), top, x(time), bottom, "rgba(235,247,247,.4)");
  point(context, x(time), y(angle), 4, Math.abs(angle) >= limit ? palette.limit : palette.trace);
}

async function initialiseTrace() {
  if (!scene.getContext("2d") || !chart.getContext("2d")) return;

  const response = await fetch(new URL("./pendulum-trajectory.json", import.meta.url));
  if (!response.ok) return;
  const { angles, dt } = await response.json();
  if (!Array.isArray(angles) || angles.length < 2 || !angles.every(Number.isFinite) || !(dt > 0)) return;

  const duration = (angles.length - 1) * dt;
  let currentTime = angles.indexOf(Math.max(...angles)) * dt;
  let frame = 0;
  let active = false;
  let hasStarted = false;
  slider.max = duration.toFixed(2);
  slider.step = dt.toFixed(2);

  function render(time) {
    currentTime = Math.max(0, Math.min(time, duration));
    const index = Math.min(Math.floor(currentTime / dt), angles.length - 2);
    const fraction = currentTime / dt - index;
    const angle = angles[index] + fraction * (angles[index + 1] - angles[index]);
    const exceeded = Math.abs(angle) >= limit;
    timeReadout.value = currentTime.toFixed(2) + " s";
    angleReadout.value = angle.toFixed(3);
    if (!active) slider.setAttribute("aria-valuetext", timeReadout.value);
    slider.value = currentTime.toFixed(2);
    statusReadout.textContent = exceeded ? "Limit exceeded" : "Within limit";
    statusReadout.classList.toggle("is-exceeded", exceeded);
    drawScene(angle);
    drawChart(angles, dt, currentTime, angle);
  }

  function stop(label) {
    cancelAnimationFrame(frame);
    active = false;
    playButton.textContent = label;
    slider.setAttribute("aria-valuetext", timeReadout.value);
  }

  slider.addEventListener("input", () => {
    stop("Play");
    hasStarted = true;
    render(Number(slider.value));
  });

  playButton.addEventListener("click", () => {
    if (active) {
      stop("Resume");
      return;
    }
    const start = !hasStarted || currentTime >= duration ? 0 : currentTime;
    const startClock = performance.now();
    hasStarted = true;
    active = true;
    playButton.textContent = "Pause";

    function tick(clock) {
      const next = Math.min(duration, start + (clock - startClock) / 1000);
      render(next);
      if (next === duration) stop("Replay");
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  });

  panel.hidden = false;
  figure.querySelector(".trace-fallback").hidden = true;
  render(currentTime);
  const observer = new ResizeObserver(() => render(currentTime));
  observer.observe(panel);
}

initialiseTrace().catch(() => {
  panel.hidden = true;
  figure.querySelector(".trace-fallback").hidden = false;
});
