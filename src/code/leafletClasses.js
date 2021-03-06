export const WTooltip = L.Class.extend({
  initialize: function (map) {
    this._map = map;
    // this._pane = map._panes.popupPane;
    this._pane = map._panes.tooltipPane;

    this._container = L.DomUtil.create("div", "wasabee-tooltip", this._pane);
    L.DomUtil.addClass(this._container, "wasabee-tooltip-single");
  },

  dispose: function () {
    this._pane.removeChild(this._container);
    this._container = null;
  },

  updateContent: function (labelText) {
    // const span = L.DomUtil.create("span", null, this._container);
    this._container.textContent = labelText.text;
    return this;
  },

  updatePosition: function (latlng) {
    const pos = this._map.latLngToLayerPoint(latlng);
    L.DomUtil.setPosition(this._container, pos);
    return this;
  },

  showAsError: function () {
    L.DomUtil.addClass(this._container, "wasabee-error-tooltip");
    return this;
  },

  removeError: function () {
    L.DomUtil.removeClass(this._container, "wasabee-error-tooltip");
    return this;
  },
});

export const WDialog = L.Handler.extend({
  initialize: function (map = window.map, options) {
    if (this.type === undefined) this.type = "Unextended Wasabee Dialog";
    this._map = map;
    this._container = map._container;
    this.options = {};
    L.Util.extend(this.options, options);
    this._enabled = false;
    this._smallScreen = this._isMobile();
    this._dialog = null;
    // look for operation in options, if not set, get it
    // determine large or small screen dialog sizes
  },

  enable: function () {
    if (this._enabled) return;
    L.Handler.prototype.enable.call(this);
  },

  disable: function () {
    if (!this._enabled) return;
    L.Handler.prototype.disable.call(this);
  },

  addHooks: function () {},

  removeHooks: function () {},

  _isMobile: function () {
    // return true;
    // XXX this is a cheap hack -- determine a better check
    if (window.plugin.userLocation) return true;
    return false;
  },
});

export const WButton = L.Class.extend({
  statics: {
    TYPE: "unextendedWButton",
  },

  // always have these
  _enabled: false,
  title: "Unset",

  // make sure all these bases are covered in your button
  initialize: function (map, container) {
    console.log("Wbutton init");
    if (!map) map = window.map;
    this._map = map;

    this.type = WButton.TYPE;
    this.title = "Unextended WButton";
    this._container = container;
    this.handler = this._toggleActions;

    this.button = this._createButton({
      container: container,
      // buttonImage: null,
      callback: this.handler,
      context: this,
      // className: ...,
    });
  },

  Wupdate: function () {},

  _toggleActions: function () {
    if (this._enabled) {
      this.disable();
    } else {
      this.enable();
    }
  },

  disable: function () {
    if (!this._enabled) return;
    this._enabled = false;
    if (this.actionsContainer) {
      this.actionsContainer.style.display = "none";
    }
  },

  enable: function () {
    if (this._enabled) return;
    this._enabled = true;
    if (this.actionsContainer) {
      this.actionsContainer.style.display = "block";
    }
    // disable all the others
    for (const m in window.plugin.wasabee.buttons._modes) {
      if (window.plugin.wasabee.buttons._modes[m].type != this.type)
        window.plugin.wasabee.buttons._modes[m].disable();
    }
  },

  _createButton: function (options) {
    const link = L.DomUtil.create(
      "a",
      options.className || "",
      options.container
    );
    link.href = "#";
    if (options.text) link.innerHTML = options.text;

    if (options.buttonImage) {
      const img = L.DomUtil.create("img", "wasabee-actions-image", link);
      img.id = this.type;
      img.src = options.buttonImage;
    }

    if (options.title) {
      link.title = options.title;
    }

    if (this._isTouch()) {
      L.DomEvent.on(link, "touchstart", L.DomEvent.stopPropagation)
        .on(link, "touchstart", L.DomEvent.preventDefault)
        .on(link, "touchstart", this.touchstart, options.context)
        .on(link, "touchend", this.touchend, options.context)
        .on(link, "touchmove", this.touchmove, options.context);
    } else {
      L.DomEvent.on(link, "click", L.DomEvent.stopPropagation)
        .on(link, "mousedown", L.DomEvent.stopPropagation)
        .on(link, "dblclick", L.DomEvent.stopPropagation)
        .on(link, "click", L.DomEvent.preventDefault)
        .on(link, "click", options.callback, options.context);
    }

    return link;
  },

  _touches: null,

  touchstart: function (ev) {
    this._touches = ev.changedTouches[0].target.id;
    console.log("first touch", this._touches);
    if (!this._enabled) this.enable();
  },

  touchend: function (ev) {
    this._touches = ev.changedTouches[0].target.id;
    console.log("last touch target", this._touches);
    if (this._enabled) this.disable();
  },

  touchmove: function (ev) {
    if (ev.changedTouches[0].target.id != this._touches) {
      this._touches = ev.changedTouches[0].target.id;
      console.log("new touch target", this._touches);
    }
  },

  _disposeButton: function (button, callback) {
    console.log("Wbutton _disposeButton");
    L.DomEvent.off(button, "click", L.DomEvent.stopPropagation)
      .off(button, "mousedown", L.DomEvent.stopPropagation)
      .off(button, "dblclick", L.DomEvent.stopPropagation)
      .off(button, "click", L.DomEvent.preventDefault)
      .off(button, "touchstart", L.DomEvent.preventDefault)
      .off(button, "touchend", L.DomEvent.preventDefault)
      .off(button, "click", callback);
  },

  _createSubActions: function (buttons) {
    const container = L.DomUtil.create("ul", "wasabee-actions");
    L.DomEvent.on(container, "touchenter", (ev) => {
      console.log("touchenter", ev);
    });
    L.DomEvent.on(container, "touchleave", (ev) => {
      console.log("touchleave", ev);
    });
    for (const b of buttons) {
      const li = L.DomUtil.create("li", "wasabee-subactions", container);
      this._createButton({
        title: b.title,
        text: b.text,
        buttonImage: b.img,
        container: li,
        callback: b.callback,
        context: b.context,
        className: "wasabee-subactions",
      });
      L.DomEvent.on(li, "touchenter", (ev) => {
        console.log("touchenter", ev);
      });
      L.DomEvent.on(li, "touchleave", (ev) => {
        console.log("touchleave", ev);
      });
    }
    return container;
  },

  _isTouch: function () {
    /* console.log("mobile", L.Browser.mobile);
    console.log("touch", L.Browser.touch);
    console.log("userLocation", window.plugin.userLocation); */
    // if (L.Browser.mobile && L.Browser.touch) return true;
    return false;
  },
});
