const figure = document.querySelector("#trace-viewer");
const fallback = figure.querySelector(".trace-static");
const fallbackNote = figure.querySelector(".trace-fallback-note");
const panel = figure.querySelector(".trace-interactive");
const scene = figure.querySelector("#pendulum-scene");
const chart = figure.querySelector("#pendulum-chart");
const slider = figure.querySelector("#trace-time");
const playButton = figure.querySelector("#trace-play");
const [playSymbol, playLabel] = playButton.children;
const angleReadout = figure.querySelector("#trace-angle");
const timeReadout = figure.querySelector("#trace-clock");
const statusReadout = figure.querySelector("#trace-status");
const announcement = figure.querySelector("#trace-announcement");

const limit = 0.2;
const disturbance = { start: 1, end: 1.5 };
const chartInset = { left: 41, right: 13 };
const playSymbols = { Play: "▶", Replay: "↻", Pause: "Ⅱ", Resume: "▶" };
const palette = {
  text: "#455751",
  grid: "#d4ddd5",
  trace: "#14645c",
  subdued: "#5e8175",
  limit: "#a14c3d",
  reference: "#67867a",
  track: "#50615a",
  band: "#dcebe2",
  paper: "#f5f4ec",
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

  const pivotX = width * 0.47;
  const pivotY = height * 0.86;
  const arm = Math.min(height * (width < 290 ? 0.57 : 0.69), width * 0.48);
  const vertical = -Math.PI / 2;
  const endpoint = radians => [
    pivotX + Math.sin(radians) * arm,
    pivotY - Math.cos(radians) * arm,
  ];

  context.beginPath();
  context.moveTo(pivotX, pivotY);
  context.arc(pivotX, pivotY, arm + 2, vertical - limit, vertical + limit);
  context.closePath();
  context.fillStyle = palette.band;
  context.fill();
  context.strokeStyle = palette.reference;
  context.stroke();

  context.save();
  context.setLineDash([4, 4]);
  segment(context, pivotX, pivotY, pivotX, pivotY - arm - 9, palette.reference);
  context.restore();

  context.strokeStyle = palette.track;
  context.lineWidth = 1.1;
  context.strokeRect(pivotX - 26, pivotY + 3, 52, 10);
  segment(context, pivotX - 52, pivotY + 13, pivotX + 52, pivotY + 13, palette.track);

  const [x, y] = endpoint(angle);
  const armColor = Math.abs(angle) >= limit ? palette.limit : palette.trace;
  segment(context, pivotX, pivotY, x, y, armColor, 2.8);
  const arc = arm * 0.45;
  if (Math.abs(angle) > 0.02) {
    context.beginPath();
    context.arc(pivotX, pivotY, arc, vertical + Math.min(angle, 0), vertical + Math.max(angle, 0));
    context.strokeStyle = armColor;
    context.lineWidth = 1.35;
    context.stroke();
    context.font = 'italic 17px Georgia, serif';
    context.fillStyle = armColor;
    context.textAlign = angle > 0 ? "left" : "right";
    context.fillText("θ", pivotX + Math.sign(angle) * (arc * Math.abs(Math.sin(angle)) + 8), pivotY - arc * Math.cos(angle));
  }
  point(context, pivotX, pivotY, 5, palette.track);
  point(context, pivotX, pivotY, 3, palette.paper);
}

function drawChart(angles, dt, time, angle) {
  const { context, width, height } = canvasFrame(chart);
  if (!width || !height) return;

  const duration = (angles.length - 1) * dt;
  const left = chartInset.left;
  const right = width - chartInset.right;
  const top = 26;
  const bottom = height - 25;
  const x = value => left + (right - left) * value / duration;
  const y = value => bottom - (bottom - top) * (value + 0.036) / 0.361;

  context.font = '11px "IBM Plex Mono", monospace';
  context.textBaseline = "middle";
  context.fillStyle = palette.text;
  context.textAlign = "left";
  context.fillText("θ (rad)", left, 12);
  context.textAlign = "right";
  context.fillText("t (s)", right, 12);
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
    context.fillText(String(second), x(second), height - 10);
  }

  context.fillStyle = "rgba(161,76,61,.09)";
  context.fillRect(x(disturbance.start), top, x(disturbance.end) - x(disturbance.start), bottom - top);

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
  segment(context, x(time), top, x(time), bottom, "rgba(69,87,81,.43)");
  point(context, x(time), y(angle), 4, Math.abs(angle) >= limit ? palette.limit : palette.trace);
}

async function initialiseTrace() {
  if (!scene.getContext("2d") || !chart.getContext("2d")) {
    showFallback();
    return;
  }

  const response = await fetch(new URL("./pendulum-trajectory.json", import.meta.url));
  if (!response.ok) {
    showFallback();
    return;
  }
  const { angles, dt } = await response.json();
  if (!Array.isArray(angles) || angles.length < 2 || !angles.every(Number.isFinite) || !Number.isFinite(dt) || dt <= 0) {
    showFallback();
    return;
  }

  const duration = (angles.length - 1) * dt;
  const peakIndex = angles.reduce((peak, angle, index) => Math.abs(angle) > Math.abs(angles[peak]) ? index : peak, 0);
  const eventTimes = {
    disturbance: disturbance.start,
    crossing: angles.findIndex(angle => Math.abs(angle) >= limit) * dt,
    peak: peakIndex * dt,
  };
  const events = Array.from(figure.querySelectorAll("[data-event]"), button => {
    const time = eventTimes[button.dataset.event];
    button.hidden = time < 0 || time > duration;
    button.querySelector(".trace-event-time").textContent = time.toFixed(2) + " s";
    return { button, time };
  });
  let currentTime = eventTimes.peak;
  let frame = 0;
  let active = false;
  let hasStarted = false;
  slider.max = duration.toFixed(2);
  slider.step = dt.toFixed(2);

  function describeSample() {
    return currentTime.toFixed(2) + " seconds, angle " + angleReadout.value + " radians, " + statusReadout.textContent.toLowerCase();
  }

  function showPlaybackLabel(label) {
    playLabel.textContent = label;
    playSymbol.textContent = playSymbols[label];
  }

  function highlightEvent() {
    for (const { button, time } of events) {
      button.toggleAttribute("data-current", !active && Math.abs(time - currentTime) < dt / 2);
    }
  }

  function render(time) {
    currentTime = Math.max(0, Math.min(time, duration));
    const index = Math.min(Math.floor(currentTime / dt), angles.length - 2);
    const fraction = currentTime / dt - index;
    const angle = angles[index] + fraction * (angles[index + 1] - angles[index]);
    const exceeded = Math.abs(angle) >= limit;
    timeReadout.value = currentTime.toFixed(2) + " s";
    angleReadout.value = angle.toFixed(3);
    slider.value = currentTime.toFixed(2);
    statusReadout.textContent = exceeded ? "Limit exceeded" : "Within limit";
    statusReadout.classList.toggle("is-exceeded", exceeded);
    if (!active) slider.setAttribute("aria-valuetext", describeSample());
    highlightEvent();
    drawScene(angle);
    drawChart(angles, dt, currentTime, angle);
  }

  function stop(label) {
    cancelAnimationFrame(frame);
    active = false;
    showPlaybackLabel(label);
    slider.setAttribute("aria-valuetext", describeSample());
    highlightEvent();
  }

  function seek(selectedTime) {
    stop(selectedTime >= duration ? "Replay" : "Play");
    hasStarted = true;
    render(selectedTime);
  }

  slider.addEventListener("input", () => seek(Number(slider.value)));
  for (const { button, time } of events) {
    button.addEventListener("click", () => {
      seek(time);
      announcement.textContent = describeSample();
    });
  }

  let gesture;
  function seekAtX(clientX) {
    const { left, width } = chart.getBoundingClientRect();
    const plotWidth = width - chartInset.left - chartInset.right;
    const fraction = Math.min(1, Math.max(0, (clientX - left - chartInset.left) / plotWidth));
    const index = Math.round(fraction * (angles.length - 1));
    seek(index * dt);
  }

  chart.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, direction: null };
    chart.setPointerCapture(event.pointerId);
  });
  chart.addEventListener("pointermove", event => {
    if (gesture?.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - gesture.x);
    const dy = Math.abs(event.clientY - gesture.y);
    if (gesture.direction === null && Math.max(dx, dy) > 5) {
      gesture.direction = dx >= dy ? "horizontal" : "vertical";
    }
    if (gesture.direction === "horizontal") seekAtX(event.clientX);
  });
  chart.addEventListener("pointerup", event => {
    if (gesture?.pointerId !== event.pointerId) return;
    if (gesture.direction !== "vertical") seekAtX(event.clientX);
    gesture = undefined;
  });
  chart.addEventListener("lostpointercapture", event => {
    if (gesture?.pointerId === event.pointerId) gesture = undefined;
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
    showPlaybackLabel("Pause");

    function tick(clock) {
      const next = Math.min(duration, start + (clock - startClock) / 1000);
      render(next);
      if (next === duration) stop("Replay");
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && active) stop("Resume");
  });

  panel.hidden = false;
  fallback.hidden = true;
  render(currentTime);
  const observer = new ResizeObserver(() => render(currentTime));
  observer.observe(panel);
}

function showFallback() {
  panel.hidden = true;
  fallback.hidden = false;
  fallbackNote.hidden = false;
}

initialiseTrace().catch(showFallback);
