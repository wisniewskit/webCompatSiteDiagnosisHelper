"use strict";

// Content script is called before any other page scripts,
// so we can override the wrapped window's properties here.
window.wrappedJSObject.eval(`(function() {
  let origConsole = console;

  let logTrace = (function() {
    let tracing = false;
    return function logTrace() {
      if (tracing) return;
      tracing = true;
      let args = arguments;
      // Use a timeout so that the browser doesn't lock up as badly
      // if the tab carelessly calls methods over and over.
      setTimeout(function() {
        origConsole.error.apply(origConsole, args);
      }, 0);
      tracing = false;
    }
  }());

  function findProp(object, name) {
    let proto = object;
    do {
      let prop = Object.getOwnPropertyDescriptor(proto, name);
      if (prop) return prop;
      proto = Object.getPrototypeOf(proto);
    } while(proto);
  }

  function addHook(pathStr, hook) {
    let path = pathStr.split(".");
    let object;
    try {
      object = eval(path.shift());
    } catch(e) { // ReferenceError
      return; // for now, do nothing
    }
    return wrapPath(pathStr, object, path, hook);
  }

  function wrapValue(value, pathStr, hook) {
    if (typeof value === "function") {
      return function() {
        let retval = hook(pathStr, this, value, "call", arguments);
        if (retval === undefined) {
          if (new.target) {
            retval = new (Function.prototype.bind.apply(value, arguments));
          } else {
            retval = value.apply(this, arguments);
          }
        }
        return retval;
      }
    } else {
      return value;
    }
  }

  function wrapPath(pathStr, object, path, hook) {
    if (path.length > 1) {
      let next = path.shift();
      // Sometimes the path may not exist right away
      // (for instance document.body). In that case we
      // wait until the next time it is successfully
      // get/set to try again, and keep trying each
      // part of the path likewise.
      let curval = object[next];
      if (curval) {
        object = object[next];
        wrapPath(pathStr, object, path, hook);
      } else {
        let oldprop = findProp(object, next);
        Object.defineProperty(object, next, {
          get: function() {
            let v = oldprop.get.call(object);
            if (v) {
              wrapPath(pathStr, v, path, hook);
              Object.defineProperty(object, next, oldprop);
            }
            return v;
          },
          set: function(v) {
            oldprop.set.call(object, v);
            wrapPath(pathStr, v, path, hook);
            Object.defineProperty(object, next, oldprop);
            oldprop = null;
          },
          configurable: true, // So reloading the addon doesn't throw an error.
        });
      }
    } else {
      hookName(pathStr, object, path[0], hook);
    }
  }
  
  function hookName(pathStr, object, name, hook) {
    let oldprop = findProp(object, name);
    let newprop = {
      configurable: true, // So reloading the addon doesn't throw an error.
    };
    if (oldprop && (oldprop.get || oldprop.set)) {
      for (let type of ["get", "set"]) {
        newprop[type] = function() {
          let val;
          if (oldprop[type]) {
            val = oldprop[type].apply(this, arguments);
          }
          let retval = hook(pathStr, this, val, type, arguments);
          return retval === undefined ? val : retval;
        }
      }
    } else { // value, not get/set (or no such property)
      let value = (oldprop && oldprop.value &&
                   wrapValue(oldprop.value, pathStr, hook)) || undefined;
      newprop.get = function() {
        let retval = hook(pathStr, this, value, "get", arguments);
        if (retval === undefined) {
          retval = value;
        }
        return retval;
      }
      if (!oldprop || oldprop.writable) {
        newprop.set = function(v) {
          let retval = hook(pathStr, this, v, "get", arguments);
          if (retval === undefined) {
            retval = wrapValue(v, pathStr, hook);
          }
          value = retval;
        }
      }
    }
    Object.defineProperty(object, name, newprop);
  }

  function LogGetSetCall(pathStr, thisObj, value, type, args) {
    if (type === "get") {
      logTrace(pathStr, type, thisObj);
    } else {
      logTrace(pathStr, type, args, thisObj);
    }
  }

  function LogCallOnly(pathStr, thisObj, value, type, args) {
    if (type != "get") {
      logTrace(pathStr, type, args, thisObj);
    }
  }

  function StartDebugger(pathStr, thisObj, value, type, args) {
    if (type !== "call") {
      debugger;
    }
  }

/* Various simple one-liner property/function call detects: */
/*  addHook("navigator.userAgent", LogGetSetCall);
  addHook("window.someCustomProperty", StartDebugger);
  addHook("document.documentElement.style.display", StartDebugger);
  addHook("window.setTimeout", LogCallOnly);
*/

/* Log all accesses to navigator properties: */
/*  for (let navItem in navigator) {
    addHook("navigator." + navItem, LogGetSetCall);
  }
*/

/* To detect scroll position reading/setting: */
/*  addHook("window.scroll", LogCallOnly);
  addHook("window.scrollBy", LogCallOnly);
  addHook("window.scrollTo", LogCallOnly);
  addHook("window.pageXOffset", LogGetSetCall);
  addHook("window.pageYOffset", LogGetSetCall);
  addHook("document.documentElement.scrollLeft", LogGetSetCall);
  addHook("document.documentElement.scrollTop", LogGetSetCall);
  addHook("document.body.scrollLeft", LogGetSetCall);
  addHook("document.body.scrollTop", LogGetSetCall);
*/

/* To detect if shadow DOM v0/v1 are being used: */
/*  addHook("Element.prototype.createShadowRoot", LogCallOnly);
  addHook("Element.prototype.attachShadow", LogCallOnly);
  addHook("Element.prototype.detachShadow", LogCallOnly);
*/

/* To detect when audio elements are created: */
/*  addHook("document.createElement", function(pathStr, thisObj, value, type, args) {
    if (type === "call" && args[0] && args[0].toLowerCase() === "audio") {
      logTrace("document.createElement('audio')", thisObj, type, args);
    }
  });
  addHook("document.createElementNS", function(pathStr, thisObj, value, type, args) {
    if (type === "call" && args[1] && args[1].toLowerCase() === "audio") {
      logTrace("document.createElementNS('audio')", thisObj, type, args);
    }
  });
  addHook("Element.prototype.innerHTML", function(pathStr, thisObj, value, type, args) {
    if (type === "set" && /<audio/i.test(args[0])) {
      logTrace("innerHTML = <audio>", type, args);
    }
  });
  addHook("Element.prototype.outerHTML", function(pathStr, thisObj, value, type, args) {
    if (type === "set" && /<audio/i.test(args[0])) {
      logTrace("outerHTML = <audio>", type, args);
    }
  });
  // Don't forget elements that have a custom constructor!
  addHook("window.Audio", LogCallOnly);
*/

/* To detect XMLHttpRequests sends and fetch() calls: */
/*  addHook("window.fetch", LogCallOnly);
  // Save the method and URL on the XHR objects when opened, for future use
  addHook("XMLHttpRequest.prototype.open", function(pathStr, thisObj, value, type, args) {
    if (type === "call") {
      thisObj.__lastOpenArgs = args;
    }
  });
  addHook("XMLHttpRequest.prototype.send", function(pathStr, thisObj, value, type, args) {
    if (type === "call") {
      logTrace("XMLHttpRequest.send", thisObj.__lastOpenArgs);
    }
  });
*/

/* To detect when the display style of a certain element is set to "none": */
/*  addHook("HTMLElement.prototype.style", function(pathStr, thisObj, css2styles, type, args) {
    if (type === "get" && thisObj.matches("input#lst-ib")) {
      css2styles.__sentinel = thisObj;
    }
  });
  addHook("CSS2Properties.prototype.display", function(pathStr, thisObj, value, type, args) {
    if (type === "set" && thisObj.__sentinel && args[0] === "none") {
      logTrace("#lst-ib hidden", thisObj);
    }
  });
*/

/* To detect when specific event type handlers are about to be called: */ 
/*  // Note this is not yet 100% right, as the second argument isn't always a function!
  let oldAEL = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function() {
    let elem = this;
    let type = arguments[0];
    let fn = arguments[1];
    // Only bother with elements/event types we're interested in here
    if (type === "click") {
      let oldfn = fn;
      fn = oldfn.__replacement = function() {
        logTrace(type, "event handler called on", elem);
        return oldfn.apply(this, arguments);
      }
    }
    return oldAEL.call(this, arguments[0], fn, arguments[1]);
  }
  let oldREL = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function() {
    let fn = arguments[1];
    return oldREL.call(this, arguments[0], fn.__replacement || fn, arguments[1]);
  }
*/
}());`);

