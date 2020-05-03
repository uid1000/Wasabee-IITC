import { WDialog } from "../leafletClasses";
import WasabeePortal from "../portal";
import { getSelectedOperation } from "../selectedOp";
import { greatCircleArcIntersect } from "../crosslinks";
import WasabeeLink from "../link";
import { clearAllLinks, getAllPortalsOnScreen } from "../uiCommands";
import wX from "../wX";

const OnionfieldDialog = WDialog.extend({
  statics: {
    TYPE: "OnionDialog"
  },

  addHooks: function() {
    if (!this._map) return;
    // requires newer leaflet, poke user to upgrade their IITC
    if (!this._map.distance) {
      alert("Requires IITC 0.30.1 or newer");
      return;
    }
    WDialog.prototype.addHooks.call(this);
    this._displayDialog();
  },

  removeHooks: function() {
    WDialog.prototype.removeHooks.call(this);
  },

  _displayDialog: function() {
    if (!this._map) return;

    const container = L.DomUtil.create("div", "container");
    const description = L.DomUtil.create("div", "desc", container);
    description.textContent = wX("SELECT_ONION_PORTALS");

    const anchorLabel = L.DomUtil.create("label", null, container);
    anchorLabel.textContent = wX("ANCHOR_PORTAL");
    const anchorButton = L.DomUtil.create("button", null, container);
    anchorButton.textContent = wX("SET");
    this._anchorDisplay = L.DomUtil.create("span", null, container);
    if (this._anchor) {
      this._anchorDisplay.appendChild(
        this._anchor.displayFormat(this._smallScreen)
      );
    } else {
      this._anchorDisplay.textContent = wX("NOT_SET");
    }
    L.DomEvent.on(anchorButton, "click", ev => {
      L.DomEvent.stop(ev);
      this._anchor = WasabeePortal.getSelected();
      if (this._anchor) {
        localStorage[window.plugin.wasabee.static.constant.ANCHOR_ONE_KEY] = JSON.stringify(this._anchor);
        this._anchorDisplay.textContent = "";
        this._anchorDisplay.appendChild(
          this._anchor.displayFormat(this._smallScreen)
        );
      } else {
        alert(wX("PLEASE_SELECT_PORTAL"));
      }
    });

    // Bottom buttons bar
    // Enter arrow
    const opt = L.DomUtil.create("label", "arrow", container);
    opt.textContent = "\u21b3";
    // Go button
    const button = L.DomUtil.create("button", null, container);
    button.textContent = wX("ONION");
    L.DomEvent.on(button, "click", ev => {
      L.DomEvent.stop(ev);
      this.onion.call(this);
    });

    this._dialog = window.dialog({
      title: "Onion/Rose",
      width: "auto",
      height: "auto",
      html: container,
      dialogClass: "wasabee-dialog wasabee-dialog-onion",
      closeCallback: () => {
        this.disable();
        delete this._dialog;
      },
      buttons: {
        OK: () => {
          this._dialog.dialog("close");
        },
        "Clear Links": () => {
          clearAllLinks(getSelectedOperation());
        }
      }
    });
  },

  initialize: function(map, options) {
    if (!map) map = window.map;
    this.type = OnionfieldDialog.TYPE;
    WDialog.prototype.initialize.call(this, map, options);
    this.title = "Onion/Rose";
    this.label = "Onion/Rose";
    this._operation = getSelectedOperation();
    const p = localStorage[window.plugin.wasabee.static.constant.ANCHOR_ONE_KEY];
    if (p) this._anchor = WasabeePortal.create(p);
  },

  onion: function() {
    if (!this._anchor) {
      alert("no anchor selected");
      return;
    }
    this._colors = new Array();
    for (const [k, c] of window.plugin.wasabee.static.layerTypes) {
      this._colors.push(k);
      this._trash = c;
    }
    this._colorIterator = 0;
    this._color = this._colors[this._colorIterator];
    const allPortals = getAllPortalsOnScreen(this._operation);

    // add the anchor to the operation, needed to check for crosslinks
    this._operation.addPortal(this._anchor);
    // start digging for onions
    const onion = this._recurser(allPortals, [], this._anchor);

    // batch mode isn't strictly necessary since we are loading the links in one operation
    this._operation.startBatchMode();
    // add all the found links at once
    // this is a minor abuse of the _operation object since we aren't using the  operation.addLink() method to add links
    this._operation.links.push(...onion);
    // that didn't add the anchors, so we have to do that here
    this._operation.cleanAnchorList();
    // now, remove the portals that are unused
    this._operation.cleanPortalList();
    // signal to the operation that we are done abusing it
    this._operation.endBatchMode();
  },

  // no longer operates on a a class var, different paths (if not using the fast route) have different lists
  _removeFromList: function(portalsRemaining, guid) {
    const x = new Array();
    for (const p of portalsRemaining) {
      if (p.options.guid != guid) x.push(p);
    }
    return x;
  },

  // the data passing for this (portalsRemaining, thisPath)
  // is designed to allow for determining optimum path, the fast route is quick
  // and gets a reasonable set, optimum path determination is VERY slow and nets
  // only a few extra layers
  _recurser: function(portalsRemaining, thisPath, one, two, three) {
    this._colorIterator = (this._colorIterator + 1) % this._colors.length;
    this._color = this._colors[this._colorIterator];
    if (this._color.name == "self-block") {
      this._colorIterator = (this._colorIterator + 1) % this._colors.length;
      this._color = this._colors[this._colorIterator];
    }

    // build a map of all portals still in-play
    const m = new Map();
    for (const p of portalsRemaining) {
      if (
        (two && p.options.guid == two.id) ||
        (three && p.options.guid == three.id) ||
        p.options.guid == one.id
      ) {
        portalsRemaining = this._removeFromList(
          portalsRemaining,
          p.options.guid
        );
        continue;
      }

      const pDist = this._map.distance(one.latLng, p._latlng);
      m.set(pDist, p.options.guid);
    }
    // sort by distance
    const sorted = new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
    if (sorted.length == 0) return;

    // for each of the portals in play
    for (const [k, v] of sorted) {
      // silence lint
      this._trash = k;

      // convert to wasabee portal
      const wp = WasabeePortal.get(v);
      if (!wp || !wp.id) {
        console.log("IITC has not loaded portal data for:", wp);
        continue;
      }
      // we need it in the op (this prevents dupes) for links later
      this._operation.addPortal(wp);
      // unused ones will be purged at the end

      // do the intial field
      if (!two) {
        portalsRemaining = this._removeFromList(portalsRemaining, v);
        const a = new WasabeeLink(this._operation, one.id, wp.id);
        a.color = this._color;
        a.throwOrderPos = 1;
        thisPath.push(a);
        return this._recurser(portalsRemaining, thisPath, one, wp);
      }
      if (!three) {
        portalsRemaining = this._removeFromList(portalsRemaining, v);
        const a = new WasabeeLink(this._operation, one.id, wp.id);
        a.color = this._color;
        a.throwOrderPos = 2;
        thisPath.push(a);
        const b = new WasabeeLink(this._operation, two.id, wp.id);
        b.color = this._color;
        b.throwOrderPos = 3;
        thisPath.push(b);
        // now we are bootstrapped, dive in
        return this._recurser(portalsRemaining, thisPath, one, two, wp);
      }
      // initial field done

      // create the three links, this does not add them to the operation
      const a = new WasabeeLink(this._operation, one.id, wp.id);
      const b = new WasabeeLink(this._operation, two.id, wp.id);
      const c = new WasabeeLink(this._operation, three.id, wp.id);
      a.color = this._color;
      b.color = this._color;
      c.color = this._color;

      // testBlock does not look in the op or live map data, but in thisPath
      const aBlock = this._testBlock(thisPath, a);
      const bBlock = this._testBlock(thisPath, b);
      const cBlock = this._testBlock(thisPath, c);

      // if none of the links are blocked by existing linkes in thisPath, we found an option
      if (!aBlock && !bBlock && !cBlock) {
        portalsRemaining = this._removeFromList(portalsRemaining, v);

        let Y = one;
        let Z = two;
        // determine the widest angle, wp<YZ, use that
        const angOneTwo = this._angle(wp, one, two);
        const angTwoThree = this._angle(wp, two, three);
        const angThreeOne = this._angle(wp, three, one);
        if (angOneTwo >= angTwoThree && angOneTwo >= angThreeOne) {
          Y = one;
          Z = two;
          thisPath.push(a);
          a.throwOrderPos = thisPath.length;
          thisPath.push(b);
          b.throwOrderPos = thisPath.length;
          // XXX add back-link to c if requested
        } else if (angTwoThree >= angThreeOne) {
          Y = two;
          Z = three;
          thisPath.push(b);
          b.throwOrderPos = thisPath.length;
          thisPath.push(c);
          c.throwOrderPos = thisPath.length;
          // XXX add back-link to a if requested
        } else {
          Y = three;
          Z = one;
          thisPath.push(c);
          c.throwOrderPos = thisPath.length;
          thisPath.push(a);
          a.throwOrderPos = thisPath.length;
          // XXX add back-link to b if requested
        }

        // allow users to turn this on if they want...
        if (
          localStorage["wasabee-onion-recursive"] &&
          localStorage["wasabee-onion-recursive"] == "slowAF"
        ) {
          // you might find 2 or 3 more layers on a small field, but it takes an hour to run
          // two is enough, three gets crazy even with a small number of portals
          const pathOne = this._recurser(
            new Array(...portalsRemaining),
            new Array(...thisPath),
            Y,
            Z,
            wp
          );
          const pathTwo = this._recurser(
            new Array(...portalsRemaining),
            new Array(...thisPath),
            Z,
            Y,
            wp
          );
          // console.log(pathOne.length, pathTwo.length);
          if (pathTwo.length > pathOne.lenght) return pathTwo;
          return pathOne;
        }
        // default to the fast route, which gets gets us 90+% in my testing
        return this._recurser(portalsRemaining, thisPath, Y, Z, wp);
      }
    }
    // console.log("hit bottom", thisPath.length);
    return thisPath;
  },

  // looks only at links in current (not op or live data)
  _testBlock: function(current, testing) {
    for (const against of current) {
      if (greatCircleArcIntersect(against, testing)) return true;
    }
    return false;
  },

  // angle a<bc in radians
  _angle: function(a, b, c) {
    // this formua finds b, swap a&b for our purposes
    const A = this._map.project(b.latLng || b._latlng);
    const B = this._map.project(a.latLng || a._latlng);
    const C = this._map.project(c.latLng || c._latlng);

    const AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
    const BC = Math.sqrt(Math.pow(B.x - C.x, 2) + Math.pow(B.y - C.y, 2));
    const AC = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2));
    const Z = Math.acos((BC * BC + AB * AB - AC * AC) / (2 * BC * AB));
    return Z;
  }
});

export default OnionfieldDialog;
