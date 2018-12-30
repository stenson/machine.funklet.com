/* utilities */
var readParams = function() {
  var params = {};

  window.location.search.slice(1).split("&").forEach(function(param) {
    var ps = param.split("=");
    params[ps[0]] = ps[1];
  });

  return params;
};

var getElement = document.getElementById.bind(document);

var copyArray = function(arr) {
  return arr.map(function(v) { return v.concat([]) });
};

var toarr = function(nl) {
  return [].slice.apply(nl);
};

var emptyArray = function(length) {
  var arr = [];
  while (length--) arr.push(0);
  return arr;
};

var splitToCallback = function(arr, delim, fn) {
  return arr.map(function(v) {
    return v.split(delim).map(function(i) {
      return fn(i);
    });
  });
};

var buffersWithPrefix = function(_prefix) {
  var bffs = {};
  var prefix = function(a) { return _prefix + "/" + a };

  ["hat", "ohat", "snare", "kick"].forEach(function(key) {
    bffs[key] = { c: prefix(key), o: prefix(key), a: prefix("a"+key) };
  });

  return bffs;
};

var padValues = function(values, userMeasures) {

  var measures = userMeasures ? userMeasures
    : Math.floor(values.reduce(function(acc, arr) {
        return arr.length > acc ? arr.length : acc;
      }, 0) / 32);

  var count = (measures * 32) || 32;

  // normalize the arrays
  values.map(function(arr, n) {
    for (var i = 0; i < count; i++) {
      var v = arr[i];
      values[n][i] = v ? v : 0;
    }
  });

  return count;
};

var writeMeasures = function(count, measureBlock) {
  if (count > 1) {
    var $block = $(measureBlock).show();
    var width = $block.width() / count;
    var i = 1;

    do {
      $block.append(
        $('<div/>').addClass('measure').width(width-1).text(i)
      );
    } while (++i <= count)

    return $block.children();
  } else {
    return $();
  }
};

var animateGridForMeasureChanges = function(diagram, grid, $blocks) {
  var $grid = $(grid);
  var visibleFrame = 1;
  var currentFrame = null;
  var shouldAnimate = true;
  var lockGrid = false;
  var defaultSpeed = 400;

  var animate = function(frame, speed, select) {
    if (lockGrid) return;

    var f = (typeof frame == 'number' ? frame : currentFrame) / 32;
    visibleFrame = f;
    $grid.animate({ top: (-(f * 93)) }, speed || 0);
    $blocks.removeClass('selected');
    select && $blocks.eq(visibleFrame).addClass('selected');
  };

  $(grid)
    .on('mouseenter', function() {
      shouldAnimate = false;
    })
    .on('mouseleave', function() {
      shouldAnimate = true;
      animate(null, defaultSpeed);
    });

  $blocks.on('click', function() {
    lockGrid = false;

    if ($(this).hasClass('selected')) {
      animate(null, defaultSpeed);
      $(diagram).trigger('unlock');
    } else {
      var index = $(this).index();
      animate(index * 32, defaultSpeed, true);
      lockGrid = true;
      $(diagram).trigger('lock', { measure: index });
    }
  });

  return function(i) {
    currentFrame = i;
    shouldAnimate && animate(null, 200);
    $blocks.removeClass('current').eq(i/32).addClass('current');
  };
};

/* sample loading */

var loadSampleWithUrl = function(context, url, name, callback, progress) {
  if (false) {
    authorDigitalBuffer(context, url, name, callback);
    progress && progress({
      total: 100,
      loaded: 100
    });
    return;
    // need to figure out how to call the progress function
  }

  var request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  request.onload = function() {
    context.decodeAudioData(request.response, callback, function() {
      console.error("Could not load", url);
      callback();
    });
  };

  progress && (request.onprogress = progress);
  request.send();
};

var digitalBufferMap = {
  foothat:  [ 550, 0.5, 0.05 ],
  hat:      [ ],
  ahat:     [ ],
  ohat:     [ ],
  aohat:    [ ],
  snare:    [ ],
  asnare:   [ ],
  kick:     [ ],
  akick:    [ ]
};

var authorDigitalBuffer = function(context, url, name, callback) {
  var sampleName = name.split("/")[1];
  callback(writeSineBuffer.apply(null, [context].concat(digitalBufferMap[sampleName])));
};

var writeSineBuffer = function(context, pitch, noise, volume) {
  var buffer = context.createBuffer(1, 44100/4, 44100);
  var c0 = buffer.getChannelData(0);
  var amp = volume || 0.5;

  for (var i = 0; i < (44100/4); i++) {
    if (i > 1000 && amp > 0) {
      amp -= 0.05
    }
    c0[i] = amp * Math.sin(i / (44100 / (220 * 2 * Math.PI)));
    //c0[i] += (Math.random() > 0.5) ? (Math.random()/20) : (-Math.random()/20);
    //c0[i] = amp * Math.random();
  }

  return buffer;
};

var getBuffersFromSampleNames = function(names, context, callback) {
  var buffers = {};
  var queue = 0;

  names.map(function(name, i) {
    var url = ["/sounds/", name, ".wav"].join("");
    queue++;
    loadSampleWithUrl(context, url, name, function(buffer) {
      if (buffer) buffers[name] = buffer;
      else console.log("url ", url, " failed to decode");
      if (--queue === 0) callback(buffers);
    });
  });
};

/* sample playing */

var playSampleWithBuffer = function(context, buffer, start, volume, rate) {
  var source = context.createBufferSource();
  var dryGain = context.createGain();
  var wetGain = context.createGain();

  source.playbackRate.value = rate || 1.0;

  source.buffer = buffer ? buffer : convolver.buffer;
  dryGain.gain.value = volume * gains.dry;
  wetGain.gain.value = volume * gains.wet;
  source.connect(dryGain);
  source.connect(wetGain);
  dryGain.connect(gainNode);
  wetGain.connect(convolver);

  source.start(start);
  return source;
};

/* table writing */

var writeValueIntoCell = function(value, tr) {
  return $("<div class='td'/>")
    .attr("volume", value)
    .appendTo($("<div class='td-holder'/>").appendTo($(tr)));
};

var writeValuesIntoRow = function(values, tr, name) {
  return values.map(function(value) {
    return writeValueIntoCell(value, tr).get(0);
  });
};

var writeValuesIntoTable = function(patterns, trs, names) {
  return patterns.map(function(values, i) {
    return writeValuesIntoRow(values, trs[i], names[i]);
  });
};

var writeModifiersIntoTable = function(length, where, modifiedValues, hats) {
  var tds = [];

  for(var i = 0; i < length; i++) {
    tds.push(writeValueIntoCell(0, where)
      .append($("<span class='plus'>+</span>"))
      .attr("stick", hats[i] > 0)
      .attr("modified", modifiedValues[i] || false)
      .get(0));
  }
  return tds;
};

/* listening for value changes */

var listenForValuesFromRows = function(rows, values, limit, modifiers) {
  var modNumber = null;

  document.body.addEventListener("keydown", function(e) {
    var num = e.keyCode - 48;
    modNumber =  (num && num >= 0 && num <= 4) ? num : null;
  }, true);

  document.body.addEventListener("keyup", function(e) {
    modNumber =  null;
  }, true);

  rows.forEach(function(tr, i) {
    tr.forEach(function(td, j) {
      var setVolume = function(volume) {
        td.setAttribute("volume", values[i][j] = volume);
        i === 0 && modifiers[j].setAttribute("stick", volume > 0);
      };

      td.addEventListener("mouseup", function(e) {
        var v = parseInt(td.getAttribute("volume"));
        if (modNumber) {
          setVolume(modNumber);
        } else {
          setVolume((e.metaKey || v === limit) ? 0 : (e.altKey) ? limit : v + 1);
        }
      }, true);

      td.addEventListener("mouseover", function(e) {
        if (e.shiftKey) {
          setVolume(modNumber || 0);
        }
      }, true);
    });
  });
};

var listenForModifiers = function(modifiers, modifiedValues, values) {
  modifiers.forEach(function(modifier, i) {
    var setValue = function(v) {
      modifiedValues[i] = v;
      modifier.setAttribute("modified", v);
    };

    modifier.addEventListener("mouseup", function(e) {
      setValue(parseInt(modifier.getAttribute("modified"), 10) > 0 ? 0 : 1);
    });
  });
};

var blurKeyup = function(el, callback) {
  var time = null;

  el.addEventListener("blur", callback, true);
};

var listenForBpmChange = function(bpm, el, form, divisor, context, start, stop) {
  var divisorValue = 1;

  var updateBpm = function() {
    setTimeout(function() {
      var i = parseInt(el.value, 10);
      if (i && i !== bpm.value) bpm.value = i;
      divisorValue = parseFloat(divisor.value) || 1;
      el.value = bpm.value;
      bpm.value = bpm.value / divisorValue;
    }, 0);
  };

  blurKeyup(el, updateBpm);

  form.addEventListener("submit", function(e) {
    e.preventDefault();
    updateBpm();
  }, true);

  blurKeyup(divisor, function() {
    updateBpm();
  });

  el.value = bpm.value;
  updateBpm();
};

var sum = function(arr) {
  return arr.reduce(function(acc, v) {
    return acc + v;
  }, 0);
};

var listenForSwingChange = function(swing, meter, diagram) {
  var children = [].slice.apply(meter.children);

  var set = function(i) {
    swing.value = i/12;
    diagram.className = "swing-"+i;

    var j = children.length;
    while (--j >= 0) {
      children[j].className = (j < i) ? "" : "swung";
    }
  };

  children.forEach(function(m, i) {
    m.addEventListener("mouseup", function() { set(i) }, true);
  });

  set(parseInt(swing.value, 10)); // initialize
};

var listenForJdChange = function(jds, controls, rows) {
  var update = function(i) {
    rows[i].style.marginLeft = (jds[i]*100) + "px";
  };

  controls.forEach(function(control, i) {
    update(i);

    toarr(control.children).forEach(function(el, j) {
      el.addEventListener("mouseup", function() {
        jds[i] = j === 0 ? jds[i] - 0.01 : jds[i] + 0.01;
        update(i);
      }, true);
    });
  });
};

var listenForMutes = function(mutes, els, trs) {
  els.forEach(function(el, i) {
    el.addEventListener("mouseup", function() {
      mutes[i] = !mutes[i];
      $(el)[(mutes[i]?"add":"remove")+"Class"]("muted");
      $(trs[i])[(mutes[i]?"add":"remove")+"Class"]("muted");
    }, true);
  });
};

var listenForRateChanges = function(rates, els, trs) {
  els.forEach(function(el, i) {
    var offsetTop = el.getBoundingClientRect().top;
    var meter = el.children[0];

    var listenToDrag = function(e) {
      var delta = e.pageY - offsetTop;
      meter.style.top = delta + "px";
      rates[i] = 15/delta;
    };

    meter.style.top = (15/rates[i]) + "px";

    el.addEventListener("mousedown", function(e) {
      listenToDrag(e);
      el.addEventListener("mousemove", listenToDrag, true);
    }, true);

    el.addEventListener("mouseup", function(e) {
      el.removeEventListener("mousemove", listenToDrag, true);
    }, true);
  });
};

var listenForAlts = function(alts, bffs, els, trs) {
  var map = ["hat", "snare", "kick"];

  els.forEach(function(el, i) {
    var change = function() {
      var r = bffs[map[i]];
      alts[i] = !alts[i];
      r.c = alts[i] ? r.a : r.o;
      el.className = alts[i] ? "alt altered" : "alt";

      if (i === 0) {
        var o = bffs.ohat;
        o.c = alts[i] ? o.a : o.o;
      }
    };

    el.addEventListener("mouseup", change, true);
    alts[i] = !alts[i]; // flip it once cause change flips it again
    change();
  });
};

var listenForSave = function(button, callback) {
  button.addEventListener("click", function(e) {
    button.href = callback();
  }, true);
};

var listenForGainChange = function(gains, which, key) {
  document.body.addEventListener("keydown", function(e) {
    if (e.keyCode === key && gains[which] >= 0) {
      if (e.shiftKey) {
        gains[which] -= 0.1;
      } else {
        gains[which] += 0.1;
      }
      if (gains[which] < 0) {
        gains[which] = 0;
      }
    }
  }, true);
};

var listenForStartStop = function(start, stop) {
  $(document).on("keydown", function(e) {
    if (e.keyCode === 32) {
      stop();
      start();
    }
  });
};

var listenForShortcuts = function() {
  var $box = $("#shortcuts-box");
  $box.click(function() { $box.hide() });

  $("#shortcuts").click(function(e) {
    e.preventDefault();
    $box.is(":visible") ? $box.hide() : $box.show();
  });
};

var runCallbackWithMetronome = function(context, bpm, readCount, clickback, swing, jd) {
  var clickRate = (60 / bpm.value) / readCount;
  var lastTime = context.currentTime - 0.1;
  var i = 1;

  return setInterval(function() {
    var current = context.currentTime;
    var lag = current - lastTime;

    if (current > lastTime + clickRate + jd[0][jd[1]]) {
      clickback(lag);

      var shiftNext = (++i)%2 === 0;
      clickRate = (60 / bpm.value) / readCount;
      lastTime += clickRate;

      var s = swing.value;
      s && (shiftNext) ? (lastTime += (s*clickRate)) : (lastTime -= (s*clickRate));
    }
  }, 0);
};

var testForAudioSupport = function() {
  if (!window["webkitAudioContext"] && !window["AudioContext"]) {
    $("#indicator-outer").hide();
    $("#unsupported").show().toggle(function() {
      $("#explanation").show();
    }, function() {
      $("#explanation").hide();
    });
    throw Error("Funklet can't play here");
  }
};
