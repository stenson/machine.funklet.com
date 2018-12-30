
var params = readParams();

var measures = params.m
  ? parseInt(params.m, 10)
    : null;

var values = params.vals
  ? splitToCallback(params.vals.split(";"), "", parseInt)
    : [[], [], []];

var modifiedValues = params.mods
  ? splitToCallback([params.mods], ".", parseInt)[0]
    : [];

var bpm = params.b
  ? { value: parseInt(params.b, 10) }
    : { value: 120 };

var swing = params.s
  ? { value: parseInt(params.s, 10) }
    : { value: 0 };

var jds = params.jd
  ? splitToCallback([params.jd], ",", parseFloat)[0]
    : [0,0,0];

var rates = params.r
  ? splitToCallback([params.r], ",", parseFloat)[0]
    : [1, 1, 1];

var alts = params.a
  ? splitToCallback([params.a], "", parseInt)[0]
    : [0, 0, 0];

var prefix = params.pf ? params.pf : "standard";
var NO_VOLUMES = params.nv ? true : false;

// shortcut to maestro mode
if (params.maestro) {
  prefix = "maestro";
  NO_VOLUMES = true;
}

var count = padValues(values, measures);
var measures = count / 32; // re-calculate
var mutes = [0, 0, 0];
var originals = copyArray(values);
var length = count - 1;

var bffs = buffersWithPrefix(prefix);
var names = [bffs.hat.o, bffs.snare.o, bffs.kick.o];

var diagram = getElement("diagram");
var trs = toarr(diagram.querySelectorAll(".tr"));
var modifiers = writeModifiersIntoTable(count, trs[0], modifiedValues, values[0]);
var rows = writeValuesIntoTable(values, trs.slice(1), names);

var grid = getElement("grid");
var measureBlocks = writeMeasures(count/32, getElement("measures"));
var updateGrid = animateGridForMeasureChanges(diagram, grid, measureBlocks);




testForAudioSupport();

listenForModifiers(modifiers, modifiedValues, values);
listenForValuesFromRows(rows, values, 4, modifiers);
listenForSwingChange(swing, getElement("swing-meter"), diagram);

var arrFromSel = function(sel) {
  return toarr(diagram.querySelectorAll(sel));
};

listenForJdChange(jds, arrFromSel(".jd"), trs.slice(1));
listenForMutes(mutes, arrFromSel(".mute"), trs.slice(1));
listenForRateChanges(rates, arrFromSel(".rate"), trs.slice(1));
listenForAlts(alts, bffs, arrFromSel(".alt"), trs.slice(1));

var gains = {
  dry: NO_VOLUMES ? 1.0 : 1.2,
  wet: NO_VOLUMES ? 0.0 : 0.1
};

listenForGainChange(gains, "dry", 86);
listenForGainChange(gains, "wet", 82);

var context = null;
var convolver = null;
var gainNode = null;
var effectNode = null;

var outstandingOpen = null;
var buffers = {};

function createAndStartContext() {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  context = new window.AudioContext();
  convolver = context.createConvolver();
  gainNode = context.createGain();
  effectNode = context.createGain();

  gainNode.gain.value = 1.0;
  gainNode.connect(context.destination);
  effectNode.gain.value = 1.0;
  effectNode.connect(context.destination);
  convolver.connect(effectNode);

  outstandingOpen = null;
  buffers = {};
}

var play = function() {
  var startButton = getElement("start");
  var stopButton = getElement("stop");
  var runCount = 0;

  var intervals = [];

  var i = [0,0,0];
  var lastI = [0,0,0];
  var lockedMeasure = false;
  var measureLength = 31;

  var runLightsWithCallback = function(j, cback) {
    var _i = i[j];
    var last = lastI[j];
    var vol = values[j][_i];

    rows[j][last].className = "td";
    rows[j][_i].className = "td current";

    (!mutes[j]) && cback(_i, vol); // yield

    lastI[j] = _i;

    if (lockedMeasure && _i === (lockedMeasure - 1) * 32 + 31) {
      i[j] = _i - measureLength;
    } else {
      i[j] = (_i === length) ? 0 : (_i + 1);
    }
  };

  $(diagram)
    .on('unlock', function() {
      lockedMeasure = false;
    })
    .on('lock', function(_, data) {
      lockedMeasure = data.measure + 1;
    });

  var volume = function(v) { return 1/(4/v); };

  var hatBack = function(lag) {
    runLightsWithCallback(0, function(_i, vol) {
      var mod = _i % 32;
      if (_i % 32 === 0) updateGrid(_i);

      var modified = modifiedValues[_i];
      var bufferName = bffs.hat.c + vol;
      var modifiedBufferName = bffs.ohat.c + vol;

      if (outstandingOpen && (vol || modified)) {
        outstandingOpen.stop(0); // kill the ringing hat
        outstandingOpen = null;
      }

      if (vol) {
        if (modified) {
          outstandingOpen = NO_VOLUMES ?
            playSampleWithBuffer(context, buffers[modifiedBufferName.slice(0,-1)], 0, volume(vol), rates[0])
            : playSampleWithBuffer(context, buffers[modifiedBufferName], 0, 1, rates[0]);
        }
        else {
          NO_VOLUMES ?
            playSampleWithBuffer(context, buffers[bufferName.slice(0,-1)], 0, volume(vol), rates[0])
            : playSampleWithBuffer(context, buffers[bufferName], 0, 1, rates[0])
        }
      } else if (modified) {
        playSampleWithBuffer(context, buffers[prefix+"/foothat"], 0, 1, rates[0]);
      }
    });
  };

  var snareBack = function(lag) {
    runLightsWithCallback(1, function(_i, vol) {
      if (NO_VOLUMES) {
        vol && playSampleWithBuffer(context, buffers[bffs.snare.c], 0, volume(vol), rates[1]);
      } else {
        vol && playSampleWithBuffer(context, buffers[bffs.snare.c+vol], 0, 1, rates[1]);
      }
    });
  };

  var kickBack = function(lag) {
    if (lag > 2) return stop();

    runLightsWithCallback(2, function(_i, vol) {
      if (NO_VOLUMES) {
        vol && playSampleWithBuffer(context, buffers[bffs.kick.c], 0, volume(vol), rates[2]);
      } else {
        vol && playSampleWithBuffer(context, buffers[bffs.kick.c+vol], 0, 1, rates[2]);
      }
    });
  };

  var start = function() {
    runCount = 0;
    if (lockedMeasure) {
      var zero = (32 * (lockedMeasure - 1));
      i = [zero, zero, zero];
    }

    startButton.style.display = "none";
    stopButton.style.display = "block";
    intervals = [
      runCallbackWithMetronome(context, bpm, 4, hatBack, swing, [jds, 0]),
      runCallbackWithMetronome(context, bpm, 4, snareBack, swing, [jds, 1]),
      runCallbackWithMetronome(context, bpm, 4, kickBack, swing, [jds, 2])
    ];
  };

  var stop = function() {
    i = [0, 0, 0]; // reset counters to start
    stopButton.style.display = "none";
    startButton.style.display = "block";
    intervals.map(clearInterval);
  };

  startButton.addEventListener("mouseup", start, true);
  stopButton.addEventListener("mouseup", stop, true);
  startButton.style.visibility = "visible";

  listenForStartStop(start, stop);
  listenForShortcuts();
  listenForBpmChange(bpm,
    getElement("bpm"),
    getElement("bpm-form"),
    getElement("bpm-divisor"),
    context,
    start,
    stop
  );

  var stopAndLinkTo = function(base) {
    return function() {
      stop();
      var url = [
        base + "?vals=", values.map(function(vs){ return vs.join("") }).join(";"),
        "&mods=", modifiedValues.join(".").replace(/NaN|0/g, ""),
        "&b=", bpm.value,
        "&s=", (swing.value*12),
        "&jd=", jds.join(","),
        "&r=", rates.join(","),
        "&a=", alts.join("").replace(/false/g,"0").replace(/true/g,"1")
      ].join("");

      if (params.maestro) url += "&maestro=true";
      return url;
    };
  };

  listenForSave(getElement("save"), stopAndLinkTo("/funklet.html"));
  listenForSave(getElement("midi"), stopAndLinkTo("http://radiant-sunset-8537.herokuapp.com/funklet.mid"));
};

var loadEnvironment = function() {
  var indicator = getElement("indicator");

  var buildNames = NO_VOLUMES ? function(a) {
      return [a];
    } : function(a) {
      return ([1,2,3,4]).map(function(i) {
        return a+""+i;
      });
    };

  var sampleNames = (function(bffs) {
    return ([prefix+"/foothat"])
      .concat(buildNames(bffs.hat.o))
      .concat(buildNames(bffs.hat.a))
      .concat(buildNames(bffs.ohat.o))
      .concat(buildNames(bffs.ohat.a))
      .concat(buildNames(bffs.snare.o))
      .concat(buildNames(bffs.snare.a))
      .concat(buildNames(bffs.kick.o))
      .concat(NO_VOLUMES ? buildNames(bffs.kick.a) : []);
  })(bffs);

  loadSampleWithUrl(context, "/sounds/spring.wav", "/spring", function(spring) {
    convolver.buffer = spring;
    //playSampleWithBuffer(context, spring, 0, 0); // start the audio context
    $("#indicator-outer").hide();
    play();
  }, function(e) {
    indicator.style.height = Math.ceil(25 * (e.loaded / e.total)) + "px";
  });

  setTimeout(function() {
    getBuffersFromSampleNames(sampleNames, context, function(bs) {
      buffers.spring = convolver.buffer;
      buffers = bs;
    });
  }, 100);
};

$("#cover").click(function() {
  $(this).remove();
  createAndStartContext();
  loadEnvironment();
});