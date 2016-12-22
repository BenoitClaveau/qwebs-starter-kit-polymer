Polymer({
      is: 'app-drawer',

      properties: {
        /**
         * The opened state of the drawer.
         */
        opened: {
          type: Boolean,
          value: false,
          notify: true,
          reflectToAttribute: true
        },

        /**
         * The drawer does not have a scrim and cannot be swiped close.
         */
        persistent: {
          type: Boolean,
          value: false,
          reflectToAttribute: true
        },

        /**
         * The transition duration of the drawer in milliseconds.
         */
        transitionDuration: {
          type: Number,
          value: 200
        },

        /**
         * The alignment of the drawer on the screen ('left', 'right', 'start' or 'end').
         * 'start' computes to left and 'end' to right in LTR layout and vice versa in RTL
         * layout.
         */
        align: {
          type: String,
          value: 'left'
        },

        /**
         * The computed, read-only position of the drawer on the screen ('left' or 'right').
         */
        position: {
          type: String,
          readOnly: true,
          reflectToAttribute: true
        },

        /**
         * Create an area at the edge of the screen to swipe open the drawer.
         */
        swipeOpen: {
          type: Boolean,
          value: false,
          reflectToAttribute: true
        },

        /**
         * Trap keyboard focus when the drawer is opened and not persistent.
         */
        noFocusTrap: {
          type: Boolean,
          value: false
        },

        /**
         * Disables swiping on the drawer.
         */
        disableSwipe: {
          type: Boolean,
          value: false
        }
      },

      observers: [
        'resetLayout(position, isAttached)',
        '_resetPosition(align, isAttached)',
        '_styleTransitionDuration(transitionDuration)',
        '_openedPersistentChanged(opened, persistent)'
      ],

      _translateOffset: 0,

      _trackDetails: null,

      _drawerState: 0,

      _boundEscKeydownHandler: null,

      _firstTabStop: null,

      _lastTabStop: null,

      attached: function() {
        // Only transition the drawer after its first render (e.g. app-drawer-layout
        // may need to set the initial opened state which should not be transitioned).
        this._styleTransitionDuration(0);
        Polymer.RenderStatus.afterNextRender(this, function() {
          this._styleTransitionDuration(this.transitionDuration);
          this._boundEscKeydownHandler = this._escKeydownHandler.bind(this);
          this._resetDrawerState();

          // contentContainer will transition on opened state changed, and scrim will
          // transition on persistent state changed when opened - these are the
          // transitions we are interested in.
          this.$.scrim.addEventListener('transitionend', this._transitionend.bind(this));
          this.$.contentContainer.addEventListener('transitionend', this._transitionend.bind(this));

          this.addEventListener('keydown', this._tabKeydownHandler.bind(this))

          // Only listen for horizontal track so you can vertically scroll inside the drawer.
          this.listen(this, 'track', '_track');
          this.setScrollDirection('y');
        });

        this.fire('app-drawer-attached');
      },

      detached: function() {
        document.removeEventListener('keydown', this._boundEscKeydownHandler);
      },

      /**
       * Opens the drawer.
       */
      open: function() {
        this.opened = true;
      },

      /**
       * Closes the drawer.
       */
      close: function() {
        this.opened = false;
      },

      /**
       * Toggles the drawer open and close.
       */
      toggle: function() {
        this.opened = !this.opened;
      },

      /**
       * Gets the width of the drawer.
       *
       * @return {number} The width of the drawer in pixels.
       */
      getWidth: function() {
        return this.$.contentContainer.offsetWidth;
      },

      /**
       * Resets the layout. The event fired is used by app-drawer-layout to position the
       * content.
       *
       * @method resetLayout
       */
      resetLayout: function() {
        this.fire('app-drawer-reset-layout');
      },

      _isRTL: function() {
        return window.getComputedStyle(this).direction === 'rtl';
      },

      _resetPosition: function() {
        switch (this.align) {
          case 'start':
            this._setPosition(this._isRTL() ? 'right' : 'left');
            return;
          case 'end':
            this._setPosition(this._isRTL() ? 'left' : 'right');
            return;
        }
        this._setPosition(this.align);
      },

      _escKeydownHandler: function(event) {
        var ESC_KEYCODE = 27;
        if (event.keyCode === ESC_KEYCODE) {
          // Prevent any side effects if app-drawer closes.
          event.preventDefault();
          this.close();
        }
      },

      _track: function(event) {
        if (this.persistent || this.disableSwipe) {
          return;
        }

        // Disable user selection on desktop.
        event.preventDefault();

        switch (event.detail.state) {
          case 'start':
            this._trackStart(event);
            break;
          case 'track':
            this._trackMove(event);
            break;
          case 'end':
            this._trackEnd(event);
            break;
        }
      },

      _trackStart: function(event) {
        this._drawerState = this._DRAWER_STATE.TRACKING;

        // Disable transitions since style attributes will reflect user track events.
        this._styleTransitionDuration(0);
        this.style.visibility = 'visible';

        var rect = this.$.contentContainer.getBoundingClientRect();
        if (this.position === 'left') {
          this._translateOffset = rect.left;
        } else {
          this._translateOffset = rect.right - window.innerWidth;
        }

        this._trackDetails = [];
      },

      _trackMove: function(event) {
        this._translateDrawer(event.detail.dx + this._translateOffset);

        // Use Date.now() since event.timeStamp is inconsistent across browsers (e.g. most
        // browsers use milliseconds but FF 44 uses microseconds).
        this._trackDetails.push({
          dx: event.detail.dx,
          timeStamp: Date.now()
        });
      },

      _trackEnd: function(event) {
        var x = event.detail.dx + this._translateOffset;
        var drawerWidth = this.getWidth();
        var isPositionLeft = this.position === 'left';
        var isInEndState = isPositionLeft ? (x >= 0 || x <= -drawerWidth) :
          (x <= 0 || x >= drawerWidth);

        if (!isInEndState) {
          // No longer need the track events after this method returns - allow them to be GC'd.
          var trackDetails = this._trackDetails;
          this._trackDetails = null;

          this._flingDrawer(event, trackDetails);
          if (this._drawerState === this._DRAWER_STATE.FLINGING) {
            return;
          }
        }

        // If the drawer is not flinging, toggle the opened state based on the position of
        // the drawer.
        var halfWidth = drawerWidth / 2;
        if (event.detail.dx < -halfWidth) {
          this.opened = this.position === 'right';
        } else if (event.detail.dx > halfWidth) {
          this.opened = this.position === 'left';
        }

        if (isInEndState) {
          // Reset drawer state now since there will be no transitionend event.
          this._resetDrawerState();
        }

        this._styleTransitionDuration(this.transitionDuration);
        this._resetDrawerTranslate();
        this.style.visibility = '';
      },

      _calculateVelocity: function(event, trackDetails) {
        // Find the oldest track event that is within 100ms using binary search.
        var now = Date.now();
        var timeLowerBound = now - 100;
        var trackDetail;
        var min = 0;
        var max = trackDetails.length - 1;

        while (min <= max) {
          // Floor of average of min and max.
          var mid = (min + max) >> 1;
          var d = trackDetails[mid];
          if (d.timeStamp >= timeLowerBound) {
            trackDetail = d;
            max = mid - 1;
          } else {
            min = mid + 1;
          }
        }

        if (trackDetail) {
          var dx = event.detail.dx - trackDetail.dx;
          var dt = (now - trackDetail.timeStamp) || 1;
          return dx / dt;
        }
        return 0;
      },

      _flingDrawer: function(event, trackDetails) {
        var velocity = this._calculateVelocity(event, trackDetails);

        // Do not fling if velocity is not above a threshold.
        if (Math.abs(velocity) < this._MIN_FLING_THRESHOLD) {
          return;
        }

        this._drawerState = this._DRAWER_STATE.FLINGING;

        var x = event.detail.dx + this._translateOffset;
        var drawerWidth = this.getWidth();
        var isPositionLeft = this.position === 'left';
        var isVelocityPositive = velocity > 0;
        var isClosingLeft = !isVelocityPositive && isPositionLeft;
        var isClosingRight = isVelocityPositive && !isPositionLeft;
        var dx;
        if (isClosingLeft) {
          dx = -(x + drawerWidth);
        } else if (isClosingRight) {
          dx = (drawerWidth - x);
        } else {
          dx = -x;
        }

        // Enforce a minimum transition velocity to make the drawer feel snappy.
        if (isVelocityPositive) {
          velocity = Math.max(velocity, this._MIN_TRANSITION_VELOCITY);
          this.opened = this.position === 'left';
        } else {
          velocity = Math.min(velocity, -this._MIN_TRANSITION_VELOCITY);
          this.opened = this.position === 'right';
        }

        // Calculate the amount of time needed to finish the transition based on the
        // initial slope of the timing function.
        this._styleTransitionDuration(this._FLING_INITIAL_SLOPE * dx / velocity);
        this._styleTransitionTimingFunction(this._FLING_TIMING_FUNCTION);

        this._resetDrawerTranslate();
      },

      _transitionend: function() {
        // If the drawer was flinging, we need to reset the style attributes.
        if (this._drawerState === this._DRAWER_STATE.FLINGING) {
          this._styleTransitionDuration(this.transitionDuration);
          this._styleTransitionTimingFunction('');
          this.style.visibility = '';
        }

        this._resetDrawerState();
      },

      _styleTransitionDuration: function(duration) {
        this.style.transitionDuration = duration + 'ms';
        this.$.contentContainer.style.transitionDuration = duration + 'ms';
        this.$.scrim.style.transitionDuration = duration + 'ms';
      },

      _styleTransitionTimingFunction: function(timingFunction) {
        this.$.contentContainer.style.transitionTimingFunction = timingFunction;
        this.$.scrim.style.transitionTimingFunction = timingFunction;
      },

      _translateDrawer: function(x) {
        var drawerWidth = this.getWidth();

        if (this.position === 'left') {
          x = Math.max(-drawerWidth, Math.min(x, 0));
          this.$.scrim.style.opacity = 1 + x / drawerWidth;
        } else {
          x = Math.max(0, Math.min(x, drawerWidth));
          this.$.scrim.style.opacity = 1 - x / drawerWidth;
        }

        this.translate3d(x + 'px', '0', '0', this.$.contentContainer);
      },

      _resetDrawerTranslate: function() {
        this.$.scrim.style.opacity = '';
        this.transform('', this.$.contentContainer);
      },

      _resetDrawerState: function() {
        var oldState = this._drawerState;
        if (this.opened) {
          this._drawerState = this.persistent ?
            this._DRAWER_STATE.OPENED_PERSISTENT : this._DRAWER_STATE.OPENED;
        } else {
          this._drawerState = this._DRAWER_STATE.CLOSED;
        }

        if (oldState !== this._drawerState) {
          if (this._drawerState === this._DRAWER_STATE.OPENED) {
            this._setKeyboardFocusTrap();
            document.addEventListener('keydown', this._boundEscKeydownHandler);
            document.body.style.overflow = 'hidden';
          } else {
            document.removeEventListener('keydown', this._boundEscKeydownHandler);
            document.body.style.overflow = '';
          }

          // Don't fire the event on initial load.
          if (oldState !== this._DRAWER_STATE.INIT) {
            this.fire('app-drawer-transitioned');
          }
        }
      },

      _setKeyboardFocusTrap: function() {
        if (this.noFocusTrap) {
          return;
        }

        // NOTE: Unless we use /deep/ (which we shouldn't since it's deprecated), this will
        // not select focusable elements inside shadow roots.
        var focusableElementsSelector = [
            'a[href]:not([tabindex="-1"])',
            'area[href]:not([tabindex="-1"])',
            'input:not([disabled]):not([tabindex="-1"])',
            'select:not([disabled]):not([tabindex="-1"])',
            'textarea:not([disabled]):not([tabindex="-1"])',
            'button:not([disabled]):not([tabindex="-1"])',
            'iframe:not([tabindex="-1"])',
            '[tabindex]:not([tabindex="-1"])',
            '[contentEditable=true]:not([tabindex="-1"])'
          ].join(',');
        var focusableElements = Polymer.dom(this).querySelectorAll(focusableElementsSelector);

        if (focusableElements.length > 0) {
          this._firstTabStop = focusableElements[0];
          this._lastTabStop = focusableElements[focusableElements.length - 1];
        } else {
          // Reset saved tab stops when there are no focusable elements in the drawer.
          this._firstTabStop = null;
          this._lastTabStop = null;
        }

        // Focus on app-drawer if it has non-zero tabindex. Otherwise, focus the first focusable
        // element in the drawer, if it exists. Use the tabindex attribute since the this.tabIndex
        // property in IE/Edge returns 0 (instead of -1) when the attribute is not set.
        var tabindex = this.getAttribute('tabindex');
        if (tabindex && parseInt(tabindex, 10) > -1) {
          this.focus();
        } else if (this._firstTabStop) {
          this._firstTabStop.focus();
        }
      },

      _tabKeydownHandler: function(event) {
        if (this.noFocusTrap) {
          return;
        }

        var TAB_KEYCODE = 9;
        if (this._drawerState === this._DRAWER_STATE.OPENED && event.keyCode === TAB_KEYCODE) {
          if (event.shiftKey) {
            if (this._firstTabStop && Polymer.dom(event).localTarget === this._firstTabStop) {
              event.preventDefault();
              this._lastTabStop.focus();
            }
          } else {
            if (this._lastTabStop && Polymer.dom(event).localTarget === this._lastTabStop) {
              event.preventDefault();
              this._firstTabStop.focus();
            }
          }
        }
      },

      _openedPersistentChanged: function() {
        if (this.transitionDuration === 0) {
          // Reset drawer state now since there will be no transitionend event.
          this._resetDrawerState();
        }
      },

      _MIN_FLING_THRESHOLD: 0.2,

      _MIN_TRANSITION_VELOCITY: 1.2,

      _FLING_TIMING_FUNCTION: 'cubic-bezier(0.667, 1, 0.667, 1)',

      _FLING_INITIAL_SLOPE: 1.5,

      _DRAWER_STATE: {
        INIT: 0,
        OPENED: 1,
        OPENED_PERSISTENT: 2,
        CLOSED: 3,
        TRACKING: 4,
        FLINGING: 5
      }

      /**
       * Fired when the layout of app-drawer is attached.
       *
       * @event app-drawer-attached
       */

      /**
       * Fired when the layout of app-drawer has changed.
       *
       * @event app-drawer-reset-layout
       */

      /**
       * Fired when app-drawer has finished transitioning.
       *
       * @event app-drawer-transitioned
       */
    });
Polymer({

    is: 'iron-media-query',

    properties: {

      /**
       * The Boolean return value of the media query.
       */
      queryMatches: {
        type: Boolean,
        value: false,
        readOnly: true,
        notify: true
      },

      /**
       * The CSS media query to evaluate.
       */
      query: {
        type: String,
        observer: 'queryChanged'
      },

      /**
       * If true, the query attribute is assumed to be a complete media query
       * string rather than a single media feature.
       */
      full: {
        type: Boolean,
        value: false
      },

      /**
       * @type {function(MediaQueryList)}
       */
      _boundMQHandler: {
        value: function() {
          return this.queryHandler.bind(this);
        }
      },

      /**
       * @type {MediaQueryList}
       */
      _mq: {
        value: null
      }
    },

    attached: function() {
      this.style.display = 'none';
      this.queryChanged();
    },

    detached: function() {
      this._remove();
    },

    _add: function() {
      if (this._mq) {
        this._mq.addListener(this._boundMQHandler);
      }
    },

    _remove: function() {
      if (this._mq) {
        this._mq.removeListener(this._boundMQHandler);
      }
      this._mq = null;
    },

    queryChanged: function() {
      this._remove();
      var query = this.query;
      if (!query) {
        return;
      }
      if (!this.full && query[0] !== '(') {
        query = '(' + query + ')';
      }
      this._mq = window.matchMedia(query);
      this._add();
      this.queryHandler(this._mq);
    },

    queryHandler: function(mq) {
      this._setQueryMatches(mq.matches);
    }

  });
/**
   * `IronResizableBehavior` is a behavior that can be used in Polymer elements to
   * coordinate the flow of resize events between "resizers" (elements that control the
   * size or hidden state of their children) and "resizables" (elements that need to be
   * notified when they are resized or un-hidden by their parents in order to take
   * action on their new measurements).
   *
   * Elements that perform measurement should add the `IronResizableBehavior` behavior to
   * their element definition and listen for the `iron-resize` event on themselves.
   * This event will be fired when they become showing after having been hidden,
   * when they are resized explicitly by another resizable, or when the window has been
   * resized.
   *
   * Note, the `iron-resize` event is non-bubbling.
   *
   * @polymerBehavior Polymer.IronResizableBehavior
   * @demo demo/index.html
   **/
  Polymer.IronResizableBehavior = {
    properties: {
      /**
       * The closest ancestor element that implements `IronResizableBehavior`.
       */
      _parentResizable: {
        type: Object,
        observer: '_parentResizableChanged'
      },

      /**
       * True if this element is currently notifying its descedant elements of
       * resize.
       */
      _notifyingDescendant: {
        type: Boolean,
        value: false
      }
    },

    listeners: {
      'iron-request-resize-notifications': '_onIronRequestResizeNotifications'
    },

    created: function() {
      // We don't really need property effects on these, and also we want them
      // to be created before the `_parentResizable` observer fires:
      this._interestedResizables = [];
      this._boundNotifyResize = this.notifyResize.bind(this);
    },

    attached: function() {
      this.fire('iron-request-resize-notifications', null, {
        node: this,
        bubbles: true,
        cancelable: true
      });

      if (!this._parentResizable) {
        window.addEventListener('resize', this._boundNotifyResize);
        this.notifyResize();
      }
    },

    detached: function() {
      if (this._parentResizable) {
        this._parentResizable.stopResizeNotificationsFor(this);
      } else {
        window.removeEventListener('resize', this._boundNotifyResize);
      }

      this._parentResizable = null;
    },

    /**
     * Can be called to manually notify a resizable and its descendant
     * resizables of a resize change.
     */
    notifyResize: function() {
      if (!this.isAttached) {
        return;
      }

      this._interestedResizables.forEach(function(resizable) {
        if (this.resizerShouldNotify(resizable)) {
          this._notifyDescendant(resizable);
        }
      }, this);

      this._fireResize();
    },

    /**
     * Used to assign the closest resizable ancestor to this resizable
     * if the ancestor detects a request for notifications.
     */
    assignParentResizable: function(parentResizable) {
      this._parentResizable = parentResizable;
    },

    /**
     * Used to remove a resizable descendant from the list of descendants
     * that should be notified of a resize change.
     */
    stopResizeNotificationsFor: function(target) {
      var index = this._interestedResizables.indexOf(target);

      if (index > -1) {
        this._interestedResizables.splice(index, 1);
        this.unlisten(target, 'iron-resize', '_onDescendantIronResize');
      }
    },

    /**
     * This method can be overridden to filter nested elements that should or
     * should not be notified by the current element. Return true if an element
     * should be notified, or false if it should not be notified.
     *
     * @param {HTMLElement} element A candidate descendant element that
     * implements `IronResizableBehavior`.
     * @return {boolean} True if the `element` should be notified of resize.
     */
    resizerShouldNotify: function(element) { return true; },

    _onDescendantIronResize: function(event) {
      if (this._notifyingDescendant) {
        event.stopPropagation();
        return;
      }

      // NOTE(cdata): In ShadowDOM, event retargetting makes echoing of the
      // otherwise non-bubbling event "just work." We do it manually here for
      // the case where Polymer is not using shadow roots for whatever reason:
      if (!Polymer.Settings.useShadow) {
        this._fireResize();
      }
    },

    _fireResize: function() {
      this.fire('iron-resize', null, {
        node: this,
        bubbles: false
      });
    },

    _onIronRequestResizeNotifications: function(event) {
      var target = event.path ? event.path[0] : event.target;

      if (target === this) {
        return;
      }

      if (this._interestedResizables.indexOf(target) === -1) {
        this._interestedResizables.push(target);
        this.listen(target, 'iron-resize', '_onDescendantIronResize');
      }

      target.assignParentResizable(this);
      this._notifyDescendant(target);

      event.stopPropagation();
    },

    _parentResizableChanged: function(parentResizable) {
      if (parentResizable) {
        window.removeEventListener('resize', this._boundNotifyResize);
      }
    },

    _notifyDescendant: function(descendant) {
      // NOTE(cdata): In IE10, attached is fired on children first, so it's
      // important not to notify them if the parent is not attached yet (or
      // else they will get redundantly notified when the parent attaches).
      if (!this.isAttached) {
        return;
      }

      this._notifyingDescendant = true;
      descendant.notifyResize();
      this._notifyingDescendant = false;
    }
  };
Polymer({
      is: 'app-drawer-layout',

      behaviors: [
        Polymer.IronResizableBehavior
      ],

      properties: {
        /**
         * If true, ignore `responsiveWidth` setting and force the narrow layout.
         */
        forceNarrow: {
          type: Boolean,
          value: false
        },

        /**
         * If the viewport's width is smaller than this value, the panel will change to narrow
         * layout. In the mode the drawer will be closed.
         */
        responsiveWidth: {
          type: String,
          value: '640px'
        },

        /**
         * Returns true if it is in narrow layout. This is useful if you need to show/hide
         * elements based on the layout.
         */
        narrow: {
          type: Boolean,
          readOnly: true,
          notify: true
        },

        /**
         * If true, the drawer will initially be opened when in narrow layout mode.
         */
        openedWhenNarrow: {
          type: Boolean,
          value: false
        }
      },

      listeners: {
        'tap': '_tapHandler',
        'app-drawer-attached': '_resetDrawerState',
        'app-drawer-reset-layout': 'resetLayout',
        'iron-resize': 'resetLayout'
      },

      observers: [
        'resetLayout(narrow, isAttached)',
        '_narrowChanged(narrow, isAttached)'
      ],

      /**
       * A reference to the app-drawer element.
       *
       * @property drawer
       */
      get drawer() {
        return Polymer.dom(this.$.drawerContent).getDistributedNodes()[0];
      },

      _tapHandler: function(e) {
        var target = Polymer.dom(e).localTarget;
        if (target && target.hasAttribute('drawer-toggle')) {
          var drawer = this.drawer;
          if (drawer && !drawer.persistent) {
            drawer.toggle();
          }
        }
      },

      resetLayout: function() {
        this.debounce('_resetLayout', function() {
          var drawer = this.drawer;
          var contentContainer = this.$.contentContainer;

          if (this.narrow || !drawer) {
            contentContainer.style.marginLeft = '';
            contentContainer.style.marginRight = '';
          } else {
            var drawerWidth = drawer.getWidth();
            if (drawer.position == 'right') {
              contentContainer.style.marginLeft = '';
              contentContainer.style.marginRight = drawerWidth + 'px';
            } else {
              contentContainer.style.marginLeft = drawerWidth + 'px';
              contentContainer.style.marginRight = '';
            }
          }
        });
      },

      _resetDrawerState: function() {
        this.debounce('_resetDrawerState', function() {
          var drawer = this.drawer;
          if (!drawer) {
            return;
          }

          if (this.narrow) {
            drawer.opened = this.openedWhenNarrow;
            drawer.persistent = false;
          } else {
            drawer.opened = drawer.persistent = true;
          }
        });
      },

      _narrowChanged: function(narrow) {
        this.toggleClass('narrow', narrow, this.$.contentContainer);
        this._resetDrawerState();
        this.notifyResize();
      },

      _onQueryMatchesChanged: function(event) {
        this._setNarrow(event.detail.value);
      },

      _computeMediaQuery: function(forceNarrow, responsiveWidth) {
        return forceNarrow ? '(min-width: 0px)' : '(max-width: ' + responsiveWidth + ')';
      }
    });
/**
   * `Polymer.IronScrollTargetBehavior` allows an element to respond to scroll events from a
   * designated scroll target.
   *
   * Elements that consume this behavior can override the `_scrollHandler`
   * method to add logic on the scroll event.
   *
   * @demo demo/scrolling-region.html Scrolling Region
   * @demo demo/document.html Document Element
   * @polymerBehavior
   */
  Polymer.IronScrollTargetBehavior = {

    properties: {

      /**
       * Specifies the element that will handle the scroll event
       * on the behalf of the current element. This is typically a reference to an element,
       * but there are a few more posibilities:
       *
       * ### Elements id
       *
       *```html
       * <div id="scrollable-element" style="overflow: auto;">
       *  <x-element scroll-target="scrollable-element">
       *    <!-- Content-->
       *  </x-element>
       * </div>
       *```
       * In this case, the `scrollTarget` will point to the outer div element.
       *
       * ### Document scrolling
       *
       * For document scrolling, you can use the reserved word `document`:
       *
       *```html
       * <x-element scroll-target="document">
       *   <!-- Content -->
       * </x-element>
       *```
       *
       * ### Elements reference
       *
       *```js
       * appHeader.scrollTarget = document.querySelector('#scrollable-element');
       *```
       *
       * @type {Element}
       */
      scrollTarget: {
        type: Object,
        value: function() {
          return this._defaultScrollTarget;
        }
      }
    },

    observers: [
      '_scrollTargetChanged(scrollTarget, isAttached)'
    ],

    /**
     * True if the event listener should be installed.
     */
    _shouldHaveListener: true,

    _scrollTargetChanged: function(scrollTarget, isAttached) {
      var eventTarget;

      if (this._oldScrollTarget) {
        this._toggleScrollListener(false, this._oldScrollTarget);
        this._oldScrollTarget = null;
      }
      if (!isAttached) {
        return;
      }
      // Support element id references
      if (scrollTarget === 'document') {

        this.scrollTarget = this._doc;

      } else if (typeof scrollTarget === 'string') {

        this.scrollTarget = this.domHost ? this.domHost.$[scrollTarget] :
            Polymer.dom(this.ownerDocument).querySelector('#' + scrollTarget);

      } else if (this._isValidScrollTarget()) {

        this._boundScrollHandler = this._boundScrollHandler || this._scrollHandler.bind(this);
        this._oldScrollTarget = scrollTarget;
        this._toggleScrollListener(this._shouldHaveListener, scrollTarget);

      }
    },

    /**
     * Runs on every scroll event. Consumer of this behavior may override this method.
     *
     * @protected
     */
    _scrollHandler: function scrollHandler() {},

    /**
     * The default scroll target. Consumers of this behavior may want to customize
     * the default scroll target.
     *
     * @type {Element}
     */
    get _defaultScrollTarget() {
      return this._doc;
    },

    /**
     * Shortcut for the document element
     *
     * @type {Element}
     */
    get _doc() {
      return this.ownerDocument.documentElement;
    },

    /**
     * Gets the number of pixels that the content of an element is scrolled upward.
     *
     * @type {number}
     */
    get _scrollTop() {
      if (this._isValidScrollTarget()) {
        return this.scrollTarget === this._doc ? window.pageYOffset : this.scrollTarget.scrollTop;
      }
      return 0;
    },

    /**
     * Gets the number of pixels that the content of an element is scrolled to the left.
     *
     * @type {number}
     */
    get _scrollLeft() {
      if (this._isValidScrollTarget()) {
        return this.scrollTarget === this._doc ? window.pageXOffset : this.scrollTarget.scrollLeft;
      }
      return 0;
    },

    /**
     * Sets the number of pixels that the content of an element is scrolled upward.
     *
     * @type {number}
     */
    set _scrollTop(top) {
      if (this.scrollTarget === this._doc) {
        window.scrollTo(window.pageXOffset, top);
      } else if (this._isValidScrollTarget()) {
        this.scrollTarget.scrollTop = top;
      }
    },

    /**
     * Sets the number of pixels that the content of an element is scrolled to the left.
     *
     * @type {number}
     */
    set _scrollLeft(left) {
      if (this.scrollTarget === this._doc) {
        window.scrollTo(left, window.pageYOffset);
      } else if (this._isValidScrollTarget()) {
        this.scrollTarget.scrollLeft = left;
      }
    },

    /**
     * Scrolls the content to a particular place.
     *
     * @method scroll
     * @param {number} left The left position
     * @param {number} top The top position
     */
    scroll: function(left, top) {
       if (this.scrollTarget === this._doc) {
        window.scrollTo(left, top);
      } else if (this._isValidScrollTarget()) {
        this.scrollTarget.scrollLeft = left;
        this.scrollTarget.scrollTop = top;
      }
    },

    /**
     * Gets the width of the scroll target.
     *
     * @type {number}
     */
    get _scrollTargetWidth() {
      if (this._isValidScrollTarget()) {
        return this.scrollTarget === this._doc ? window.innerWidth : this.scrollTarget.offsetWidth;
      }
      return 0;
    },

    /**
     * Gets the height of the scroll target.
     *
     * @type {number}
     */
    get _scrollTargetHeight() {
      if (this._isValidScrollTarget()) {
        return this.scrollTarget === this._doc ? window.innerHeight : this.scrollTarget.offsetHeight;
      }
      return 0;
    },

    /**
     * Returns true if the scroll target is a valid HTMLElement.
     *
     * @return {boolean}
     */
    _isValidScrollTarget: function() {
      return this.scrollTarget instanceof HTMLElement;
    },

    _toggleScrollListener: function(yes, scrollTarget) {
      if (!this._boundScrollHandler) {
        return;
      }
      var eventTarget = scrollTarget === this._doc ? window : scrollTarget;

      if (yes) {
        eventTarget.addEventListener('scroll', this._boundScrollHandler);
      } else {
        eventTarget.removeEventListener('scroll', this._boundScrollHandler);
      }
    },

    /**
     * Enables or disables the scroll event listener.
     *
     * @param {boolean} yes True to add the event, False to remove it.
     */
    toggleScrollListener: function(yes) {
      this._shouldHaveListener = yes;
      this._toggleScrollListener(yes, this.scrollTarget);
    }

  };
Polymer.AppLayout = Polymer.AppLayout || {};

  Polymer.AppLayout._scrollEffects = Polymer.AppLayout._scrollEffects || {};

  Polymer.AppLayout.scrollTimingFunction = function easeOutQuad(t, b, c, d) {
    t /= d;
    return -c * t*(t-2) + b;
  };

  /**
   * Registers a scroll effect to be used in elements that implement the
   * `Polymer.AppScrollEffectsBehavior` behavior.
   *
   * @param {string} effectName The effect name.
   * @param {Object} effectDef The effect definition.
   */
  Polymer.AppLayout.registerEffect = function registerEffect(effectName, effectDef) {
    if (Polymer.AppLayout._scrollEffects[effectName] != null) {
      throw new Error('effect `'+ effectName + '` is already registered.');
    }
    Polymer.AppLayout._scrollEffects[effectName] = effectDef;
  };

  /**
   * Scrolls to a particular set of coordinates in a scroll target.
   * If the scroll target is not defined, then it would use the main document as the target.
   *
   * To scroll in a smooth fashion, you can set the option `behavior: 'smooth'`. e.g.
   *
   * ```js
   * Polymer.AppLayout.scroll({top: 0, behavior: 'smooth'});
   * ```
   *
   * To scroll in a silent mode, without notifying scroll changes to any app-layout elements,
   * you can set the option `behavior: 'silent'`. This is particularly useful we you are using
   * `app-header` and you desire to scroll to the top of a scrolling region without running
   * scroll effects. e.g.
   *
   * ```js
   * Polymer.AppLayout.scroll({top: 0, behavior: 'silent'});
   * ```
   *
   * @param {Object} options {top: Number, left: Number, behavior: String(smooth | silent)}
   */
  Polymer.AppLayout.scroll = function scroll(options) {
    options = options || {};

    var docEl = document.documentElement;
    var target = options.target || docEl;
    var hasNativeScrollBehavior = 'scrollBehavior' in target.style && target.scroll;
    var scrollClassName = 'app-layout-silent-scroll';
    var scrollTop = options.top || 0;
    var scrollLeft = options.left || 0;
    var scrollTo = target === docEl ? window.scrollTo :
      function scrollTo(scrollLeft, scrollTop) {
        target.scrollLeft = scrollLeft;
        target.scrollTop = scrollTop;
      };

    if (options.behavior === 'smooth') {

      if (hasNativeScrollBehavior) {

        target.scroll(options);

      } else {

        var timingFn = Polymer.AppLayout.scrollTimingFunction;
        var startTime = Date.now();
        var currentScrollTop = target === docEl ? window.pageYOffset : target.scrollTop;
        var currentScrollLeft = target === docEl ? window.pageXOffset : target.scrollLeft;
        var deltaScrollTop = scrollTop - currentScrollTop;
        var deltaScrollLeft = scrollLeft - currentScrollLeft;
        var duration = 300;
        var updateFrame = (function updateFrame() {
          var now = Date.now();
          var elapsedTime = now - startTime;

          if (elapsedTime < duration) {
            scrollTo(timingFn(elapsedTime, currentScrollLeft, deltaScrollLeft, duration),
                timingFn(elapsedTime, currentScrollTop, deltaScrollTop, duration));
            requestAnimationFrame(updateFrame);
          } else {
            scrollTo(scrollLeft, scrollTop);
          }
        }).bind(this);

        updateFrame();
      }

    } else if (options.behavior === 'silent') {

      docEl.classList.add(scrollClassName);

      // Browsers keep the scroll momentum even if the bottom of the scrolling content
      // was reached. This means that calling scroll({top: 0, behavior: 'silent'}) when
      // the momentum is still going will result in more scroll events and thus scroll effects.
      // This seems to only apply when using document scrolling.
      // Therefore, when should we remove the class from the document element?

      clearInterval(Polymer.AppLayout._scrollTimer);

      Polymer.AppLayout._scrollTimer = setTimeout(function() {
        docEl.classList.remove(scrollClassName);
        Polymer.AppLayout._scrollTimer = null;
      }, 100);

      scrollTo(scrollLeft, scrollTop);

    } else {

      scrollTo(scrollLeft, scrollTop);

    }
  };
/**
   * `Polymer.AppScrollEffectsBehavior` provides an interface that allows an element to use scrolls effects.
   *
   * ### Importing the app-layout effects
   *
   * app-layout provides a set of scroll effects that can be used by explicitly importing
   * `app-scroll-effects.html`:
   *
   * ```html
   * <link rel="import" href="/bower_components/app-layout/app-scroll-effects/app-scroll-effects.html">
   * ```
   *
   * The scroll effects can also be used by individually importing
   * `app-layout/app-scroll-effects/effects/[effectName].html`. For example:
   *
   * ```html
   *  <link rel="import" href="/bower_components/app-layout/app-scroll-effects/effects/waterfall.html">
   * ```
   *
   * ### Consuming effects
   *
   * Effects can be consumed via the `effects` property. For example:
   *
   * ```html
   * <app-header effects="waterfall"></app-header>
   * ```
   *
   * ### Creating scroll effects
   *
   * You may want to create a custom scroll effect if you need to modify the CSS of an element
   * based on the scroll position.
   *
   * A scroll effect definition is an object with `setUp()`, `tearDown()` and `run()` functions.
   *
   * To register the effect, you can use `Polymer.AppLayout.registerEffect(effectName, effectDef)`
   * For example, let's define an effect that resizes the header's logo:
   *
   * ```js
   * Polymer.AppLayout.registerEffect('resizable-logo', {
   *   setUp: function(config) {
   *     // the effect's config is passed to the setUp.
   *     this._fxResizeLogo = { logo: Polymer.dom(this).querySelector('[logo]') };
   *   },
   *
   *   run: function(progress) {
   *      // the progress of the effect
   *      this.transform('scale3d(' + progress + ', '+ progress +', 1)',  this._fxResizeLogo.logo);
   *   },
   *
   *   tearDown: function() {
   *      // clean up and reset of states
   *      delete this._fxResizeLogo;
   *   }
   * });
   * ```
   * Now, you can consume the effect:
   *
   * ```html
   * <app-header id="appHeader" effects="resizable-logo">
   *   <img logo src="logo.svg">
   * </app-header>
   * ```
   *
   * ### Imperative API
   *
   * ```js
   * var logoEffect = appHeader.createEffect('resizable-logo', effectConfig);
   * // run the effect: logoEffect.run(progress);
   * // tear down the effect: logoEffect.tearDown();
   * ```
   *
   * ### Configuring effects
   *
   * For effects installed via the `effects` property, their configuration can be set
   * via the `effectsConfig` property. For example:
   *
   * ```html
   * <app-header effects="waterfall"
   *   effects-config='{"waterfall": {"startsAt": 0, "endsAt": 0.5}}'>
   * </app-header>
   * ```
   *
   * All effects have a `startsAt` and `endsAt` config property. They specify at what
   * point the effect should start and end. This value goes from 0 to 1 inclusive.
   *
   * @polymerBehavior
   */
  Polymer.AppScrollEffectsBehavior = [
    Polymer.IronScrollTargetBehavior,
   {

    properties: {

      /**
       * A space-separated list of the effects names that will be triggered when the user scrolls.
       * e.g. `waterfall parallax-background` installs the `waterfall` and `parallax-background`.
       */
      effects: {
        type: String
      },

      /**
       * An object that configurates the effects installed via the `effects` property. e.g.
       * ```js
       *  element.effectsConfig = {
       *   "blend-background": {
       *     "startsAt": 0.5
       *   }
       * };
       * ```
       * Every effect has at least two config properties: `startsAt` and `endsAt`.
       * These properties indicate when the event should start and end respectively
       * and relative to the overall element progress. So for example, if `blend-background`
       * starts at `0.5`, the effect will only start once the current element reaches 0.5
       * of its progress. In this context, the progress is a value in the range of `[0, 1]`
       * that indicates where this element is on the screen relative to the viewport.
       */
      effectsConfig: {
        type: Object,
        value: function() {
          return {};
        }
      },

      /**
       * Disables CSS transitions and scroll effects on the element.
       */
      disabled: {
        type: Boolean,
        reflectToAttribute: true,
        value: false
      },

      /**
       * Allows to set a `scrollTop` threshold. When greater than 0, `thresholdTriggered`
       * is true only when the scroll target's `scrollTop` has reached this value.
       *
       * For example, if `threshold = 100`, `thresholdTriggered` is true when the `scrollTop`
       * is at least `100`.
       */
      threshold: {
        type: Number,
        value: 0
      },

      /**
       * True if the `scrollTop` threshold (set in `scrollTopThreshold`) has
       * been reached.
       */
      thresholdTriggered: {
        type: Boolean,
        notify: true,
        readOnly: true,
        reflectToAttribute: true
      }
    },

    observers: [
      '_effectsChanged(effects, effectsConfig, isAttached)'
    ],

    /**
     * Updates the scroll state. This method should be overridden
     * by the consumer of this behavior.
     *
     * @method _updateScrollState
     */
    _updateScrollState: function() {},

    /**
     * Returns true if the current element is on the screen.
     * That is, visible in the current viewport. This method should be
     * overridden by the consumer of this behavior.
     *
     * @method isOnScreen
     * @return {boolean}
     */
    isOnScreen: function() {
      return false;
    },

    /**
     * Returns true if there's content below the current element. This method
     * should be overridden by the consumer of this behavior.
     *
     * @method isContentBelow
     * @return {boolean}
     */
    isContentBelow: function() {
      return false;
    },

    /**
     * List of effects handlers that will take place during scroll.
     *
     * @type {Array<Function>}
     */
    _effectsRunFn: null,

    /**
     * List of the effects definitions installed via the `effects` property.
     *
     * @type {Array<Object>}
     */
    _effects: null,

    /**
     * The clamped value of `_scrollTop`.
     * @type number
     */
    get _clampedScrollTop() {
      return Math.max(0, this._scrollTop);
    },

    detached: function() {
      this._tearDownEffects();
    },

    /**
     * Creates an effect object from an effect's name that can be used to run
     * effects programmatically.
     *
     * @method createEffect
     * @param {string} effectName The effect's name registered via `Polymer.AppLayout.registerEffect`.
     * @param {Object=} effectConfig The effect config object. (Optional)
     * @return {Object} An effect object with the following functions:
     *
     *  * `effect.setUp()`, Sets up the requirements for the effect.
     *       This function is called automatically before the `effect` function returns.
     *  * `effect.run(progress, y)`, Runs the effect given a `progress`.
     *  * `effect.tearDown()`, Cleans up any DOM nodes or element references used by the effect.
     *
     * Example:
     * ```js
     * var parallax = element.createEffect('parallax-background');
     * // runs the effect
     * parallax.run(0.5, 0);
     * ```
     */
    createEffect: function(effectName, effectConfig) {
      var effectDef = Polymer.AppLayout._scrollEffects[effectName];
      if (!effectDef) {
        throw new ReferenceError(this._getUndefinedMsg(effectName));
      }
      var prop = this._boundEffect(effectDef, effectConfig || {});
      prop.setUp();
      return prop;
    },

    /**
     * Called when `effects` or `effectsConfig` changes.
     */
    _effectsChanged: function(effects, effectsConfig, isAttached) {
      this._tearDownEffects();

      if (effects === '' || !isAttached) {
        return;
      }
      effects.split(' ').forEach(function(effectName) {
        var effectDef;
        if (effectName !== '') {
          if ((effectDef = Polymer.AppLayout._scrollEffects[effectName])) {
            this._effects.push(this._boundEffect(effectDef, effectsConfig[effectName]));
          } else {
            console.warn(this._getUndefinedMsg(effectName));
          }
        }
      }, this);

      this._setUpEffect();
    },

    /**
     * Forces layout
     */
    _layoutIfDirty: function() {
      return this.offsetWidth;
    },

    /**
     * Returns an effect object bound to the current context.
     *
     * @param {Object} effectDef
     * @param {Object=} effectsConfig The effect config object if the effect accepts config values. (Optional)
     */
    _boundEffect: function(effectDef, effectsConfig) {
      effectsConfig = effectsConfig || {};
      var startsAt = parseFloat(effectsConfig.startsAt || 0);
      var endsAt = parseFloat(effectsConfig.endsAt || 1);
      var deltaS = endsAt - startsAt;
      var noop = function() {};
      // fast path if possible
      var runFn = (startsAt === 0 && endsAt === 1) ? effectDef.run :
        function(progress, y) {
          effectDef.run.call(this,
              Math.max(0, (progress - startsAt) / deltaS), y);
        };
      return {
        setUp: effectDef.setUp ? effectDef.setUp.bind(this, effectsConfig) : noop,
        run: effectDef.run ? runFn.bind(this) : noop,
        tearDown: effectDef.tearDown ? effectDef.tearDown.bind(this) : noop
      };
    },

    /**
     * Sets up the effects.
     */
    _setUpEffect: function() {
      if (this.isAttached && this._effects) {
        this._effectsRunFn = [];
        this._effects.forEach(function(effectDef) {
          // install the effect only if no error was reported
          if (effectDef.setUp() !== false) {
            this._effectsRunFn.push(effectDef.run);
          }
        }, this);
      }
    },

    /**
     * Tears down the effects.
     */
    _tearDownEffects: function() {
      if (this._effects) {
        this._effects.forEach(function(effectDef) {
          effectDef.tearDown();
        });
      }
      this._effectsRunFn = [];
      this._effects = [];
    },

    /**
     * Runs the effects.
     *
     * @param {number} p The progress
     * @param {number} y The top position of the current element relative to the viewport.
     */
    _runEffects: function(p, y) {
      if (this._effectsRunFn) {
        this._effectsRunFn.forEach(function(run) {
          run(p, y);
        });
      }
    },

    /**
     * Overrides the `_scrollHandler`.
     */
    _scrollHandler: function() {
      if (!this.disabled) {
        var scrollTop = this._clampedScrollTop;
        this._updateScrollState(scrollTop);
        if (this.threshold > 0) {
          this._setThresholdTriggered(scrollTop >= this.threshold);
        }
      }
    },

    /**
     * Override this method to return a reference to a node in the local DOM.
     * The node is consumed by a scroll effect.
     *
     * @param {string} id The id for the node.
     */
    _getDOMRef: function(id) {
      console.warn('_getDOMRef', '`'+ id +'` is undefined');
    },

    _getUndefinedMsg: function(effectName) {
      return 'Scroll effect `' + effectName + '` is undefined. ' +
          'Did you forget to import app-layout/app-scroll-effects/effects/' + effectName + '.html ?';
    }

  }];
Polymer({
      is: 'app-header',

      behaviors: [
        Polymer.AppScrollEffectsBehavior,
        Polymer.IronResizableBehavior
      ],

      properties: {
        /**
         * If true, the header will automatically collapse when scrolling down.
         * That is, the `sticky` element remains visible when the header is fully condensed
         * whereas the rest of the elements will collapse below `sticky` element.
         *
         * By default, the `sticky` element is the first toolbar in the light DOM:
         *
         *```html
         * <app-header condenses>
         *   <app-toolbar>This toolbar remains on top</app-toolbar>
         *   <app-toolbar></app-toolbar>
         *   <app-toolbar></app-toolbar>
         * </app-header>
         * ```
         *
         * Additionally, you can specify which toolbar or element remains visible in condensed mode
         * by adding the `sticky` attribute to that element. For example: if we want the last
         * toolbar to remain visible, we can add the `sticky` attribute to it.
         *
         *```html
         * <app-header condenses>
         *   <app-toolbar></app-toolbar>
         *   <app-toolbar></app-toolbar>
         *   <app-toolbar sticky>This toolbar remains on top</app-toolbar>
         * </app-header>
         * ```
         *
         * Note the `sticky` element must be a direct child of `app-header`.
         */
        condenses: {
          type: Boolean,
          value: false
        },

        /**
         * Mantains the header fixed at the top so it never moves away.
         */
        fixed: {
          type: Boolean,
          value: false
        },

        /**
         * Slides back the header when scrolling back up.
         */
        reveals: {
          type: Boolean,
          value: false
        },

        /**
         * Displays a shadow below the header.
         */
        shadow: {
          type: Boolean,
          reflectToAttribute: true,
          value: false
        }
      },

      observers: [
        'resetLayout(isAttached, condenses, fixed)'
      ],

      listeners: {
        'iron-resize': '_resizeHandler'
      },

      /**
       * A cached offsetHeight of the current element.
       *
       * @type {number}
       */
      _height: 0,

      /**
       * The distance in pixels the header will be translated to when scrolling.
       *
       * @type {number}
       */
      _dHeight: 0,

      /**
       * The offsetTop of `_stickyEl`
       *
       * @type {number}
       */
      _stickyElTop: 0,

      /**
       * The element that remains visible when the header condenses.
       *
       * @type {HTMLElement}
       */
      _stickyEl: null,

      /**
       * The header's top value used for the `transformY`
       *
       * @type {number}
       */
      _top: 0,

      /**
       * The current scroll progress.
       *
       * @type {number}
       */
      _progress: 0,

      _wasScrollingDown: false,
      _initScrollTop: 0,
      _initTimestamp: 0,
      _lastTimestamp: 0,
      _lastScrollTop: 0,

      /**
       * The distance the header is allowed to move away.
       *
       * @type {number}
       */
      get _maxHeaderTop() {
        return this.fixed ? this._dHeight : this._height + 5;
      },

      /**
       * Returns a reference to the sticky element.
       *
       * @return {HTMLElement}?
       */
      _getStickyEl: function() {
        /** @type {HTMLElement} */
        var stickyEl;
        var nodes = Polymer.dom(this.$.content).getDistributedNodes();

        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].nodeType === Node.ELEMENT_NODE) {
            var node = /** @type {HTMLElement} */ (nodes[i]);
            if (node.hasAttribute('sticky')) {
              stickyEl = node;
              break;
            } else if (!stickyEl) {
              stickyEl = node;
            }
          }
        }
        return stickyEl;
      },

      /**
       * Resets the layout. If you changed the size of app-header via CSS
       * you can notify the changes by either firing the `iron-resize` event
       * or calling `resetLayout` directly.
       *
       * @method resetLayout
       */
      resetLayout: function() {
        this.debounce('_resetLayout', function() {
          // noop if the header isn't visible
          if (this.offsetWidth === 0 && this.offsetHeight === 0) {
            return;
          }

          var scrollTop = this._clampedScrollTop;
          var firstSetup = this._height === 0 || scrollTop === 0;
          var currentDisabled = this.disabled;

          this._height = this.offsetHeight;
          this._stickyEl = this._getStickyEl();
          this.disabled = true;

          // prepare for measurement
          if  (!firstSetup) {
            this._updateScrollState(0, true);
          }
          if (this._mayMove()) {
            this._dHeight = this._stickyEl ? this._height - this._stickyEl.offsetHeight : 0;
          } else {
            this._dHeight = 0;
          }

          this._stickyElTop = this._stickyEl ? this._stickyEl.offsetTop : 0;
          this._setUpEffect();

          if (firstSetup) {
            this._updateScrollState(scrollTop, true);
          } else {
            this._updateScrollState(this._lastScrollTop, true);
            this._layoutIfDirty();
          }
          // restore no transition
          this.disabled = currentDisabled;
          this.fire('app-header-reset-layout');
        });
      },

      /**
       * Updates the scroll state.
       *
       * @param {number} scrollTop
       * @param {boolean=} forceUpdate (default: false)
       */
      _updateScrollState: function(scrollTop, forceUpdate) {
        if (this._height === 0) {
          return;
        }

        var progress = 0;
        var top = 0;
        var lastTop = this._top;
        var lastScrollTop = this._lastScrollTop;
        var maxHeaderTop = this._maxHeaderTop;
        var dScrollTop = scrollTop - this._lastScrollTop;
        var absDScrollTop = Math.abs(dScrollTop);
        var isScrollingDown = scrollTop > this._lastScrollTop;
        var now = Date.now();

        if (this._mayMove()) {
          top = this._clamp(this.reveals ? lastTop + dScrollTop : scrollTop, 0, maxHeaderTop);
        }

        if (scrollTop >= this._dHeight) {
          top = this.condenses && !this.fixed ? Math.max(this._dHeight, top) : top;
          this.style.transitionDuration = '0ms';
        }

        if (this.reveals && !this.disabled && absDScrollTop < 100) {
          // set the initial scroll position
          if (now - this._initTimestamp > 300 || this._wasScrollingDown !== isScrollingDown) {
            this._initScrollTop = scrollTop;
            this._initTimestamp = now;
          }

          if (scrollTop >= maxHeaderTop) {
            // check if the header is allowed to snap
            if (Math.abs(this._initScrollTop - scrollTop) > 30 || absDScrollTop > 10) {
              if (isScrollingDown && scrollTop >= maxHeaderTop) {
                top = maxHeaderTop;
              } else if (!isScrollingDown && scrollTop >= this._dHeight) {
                top = this.condenses && !this.fixed ? this._dHeight : 0;
              }
              var scrollVelocity = dScrollTop / (now - this._lastTimestamp);
              this.style.transitionDuration = this._clamp((top - lastTop) / scrollVelocity, 0, 300) + 'ms';
            } else {
              top = this._top;
            }
          }
        }

        if (this._dHeight === 0) {
          progress = scrollTop > 0 ? 1 : 0;
        } else {
          progress = top / this._dHeight;
        }

        if (!forceUpdate) {
          this._lastScrollTop = scrollTop;
          this._top = top;
          this._wasScrollingDown = isScrollingDown;
          this._lastTimestamp = now;
        }

        if (forceUpdate || progress !== this._progress || lastTop !== top || scrollTop === 0) {
          this._progress = progress;
          this._runEffects(progress, top);
          this._transformHeader(top);
        }
      },

      /**
       * Returns true if the current header is allowed to move as the user scrolls.
       *
       * @return {boolean}
       */
      _mayMove: function() {
        return this.condenses || !this.fixed;
      },

      /**
       * Returns true if the current header will condense based on the size of the header
       * and the `consenses` property.
       *
       * @return {boolean}
       */
      willCondense: function() {
        return this._dHeight > 0 && this.condenses;
      },

      /**
       * Returns true if the current element is on the screen.
       * That is, visible in the current viewport.
       *
       * @method isOnScreen
       * @return {boolean}
       */
      isOnScreen: function() {
        return this._height !== 0 && this._top < this._height;
      },

      /**
       * Returns true if there's content below the current element.
       *
       * @method isContentBelow
       * @return {boolean}
       */
      isContentBelow: function() {
        if (this._top === 0) {
          return this._clampedScrollTop > 0;
        }
        return this._clampedScrollTop - this._maxHeaderTop >= 0;
      },

      /**
       * Transforms the header.
       *
       * @param {number} y
       */
      _transformHeader: function(y) {
        this.translate3d(0, (-y) + 'px', 0);
        if (this._stickyEl) {
          this.translate3d(0, this.condenses && y >= this._stickyElTop ?
              (Math.min(y, this._dHeight) - this._stickyElTop) + 'px' : 0,  0, this._stickyEl);
        }
      },

      _resizeHandler: function() {
        this.resetLayout();
      },

      _clamp: function(v, min, max) {
        return Math.min(max, Math.max(min, v));
      },

      _ensureBgContainers: function() {
        if (!this._bgContainer) {
          this._bgContainer = document.createElement('div');
          this._bgContainer.id = 'background';

          this._bgRear = document.createElement('div');
          this._bgRear.id = 'backgroundRearLayer';
          this._bgContainer.appendChild(this._bgRear);

          this._bgFront = document.createElement('div');
          this._bgFront.id = 'backgroundFrontLayer';
          this._bgContainer.appendChild(this._bgFront);

          Polymer.dom(this.root).insertBefore(this._bgContainer, this.$.contentContainer);
        }
      },

      _getDOMRef: function(id) {
        switch (id) {
          case 'backgroundFrontLayer':
            this._ensureBgContainers();
            return this._bgFront;
          case 'backgroundRearLayer':
            this._ensureBgContainers();
            return this._bgRear;
          case 'background':
            this._ensureBgContainers();
            return this._bgContainer;
          case 'mainTitle':
            return Polymer.dom(this).querySelector('[main-title]');
          case 'condensedTitle':
            return Polymer.dom(this).querySelector('[condensed-title]');
        }
        return null;
      },

      /**
       * Returns an object containing the progress value of the scroll effects
       * and the top position of the header.
       *
       * @method getScrollState
       * @return {Object}
       */
      getScrollState: function() {
        return { progress: this._progress, top: this._top };
      }

      /**
       * Fires when the layout of `app-header` changed.
       *
       * @event app-header-reset-layout
       */
    });
Polymer({
      is: 'app-header-layout',

      behaviors: [
        Polymer.IronResizableBehavior
      ],

      properties: {
        /**
         * If true, the current element will have its own scrolling region.
         * Otherwise, it will use the document scroll to control the header.
         */
        hasScrollingRegion: {
          type: Boolean,
          value: false,
          reflectToAttribute: true
        }
      },

      listeners: {
        'iron-resize': '_resizeHandler',
        'app-header-reset-layout': '_resetLayoutHandler'
      },

      observers: [
        'resetLayout(isAttached, hasScrollingRegion)'
      ],

      /**
       * A reference to the app-header element.
       *
       * @property header
       */
      get header() {
        return Polymer.dom(this.$.header).getDistributedNodes()[0];
      },

      /**
       * Resets the layout. This method is automatically called when the element is attached
       * to the DOM.
       *
       * @method resetLayout
       */
      resetLayout: function() {
        this._updateScroller();
        this.debounce('_resetLayout', this._updateContentPosition);
      },

      _updateContentPosition: function() {
        var header = this.header;
        if (!this.isAttached || !header) {
          return;
        }
        // Get header height here so that style reads are batched together before style writes
        // (i.e. getBoundingClientRect() below).
        var headerHeight = header.offsetHeight;
        // Update the header position.
        if (!this.hasScrollingRegion) {
          var rect = this.getBoundingClientRect();
          var rightOffset = document.documentElement.clientWidth - rect.right;
          header.style.left = rect.left + 'px';
          header.style.right = rightOffset + 'px';
        } else {
          header.style.left = '';
          header.style.right = '';
        }
        // Update the content container position.
        var containerStyle = this.$.contentContainer.style;
        if (header.fixed && !header.willCondense() && this.hasScrollingRegion) {
          // If the header size does not change and we're using a scrolling region, exclude
          // the header area from the scrolling region so that the header doesn't overlap
          // the scrollbar.
          containerStyle.marginTop = headerHeight + 'px';
          containerStyle.paddingTop = '';
        } else {
          containerStyle.paddingTop = headerHeight + 'px';
          containerStyle.marginTop = '';
        }
      },

      _updateScroller: function() {
        if (!this.isAttached) {
          return;
        }
        var header = this.header;
        if (header) {
          header.scrollTarget = this.hasScrollingRegion ?
              this.$.contentContainer : this.ownerDocument.documentElement;
        }
      },

      _resizeHandler: function() {
        this.resetLayout();
      },

      _resetLayoutHandler: function(e) {
        this.resetLayout();
        e.stopPropagation();
      }

    });
/**
   * While scrolling down, fade in the rear background layer and fade out the front background
   * layer (opacity interpolated based on scroll position).
   */
  Polymer.AppLayout.registerEffect('blend-background', {
    /** @this Polymer.AppLayout.ElementWithBackground */
    setUp: function setUp() {
      var fx = {};
      fx.backgroundFrontLayer = this._getDOMRef('backgroundFrontLayer');
      fx.backgroundRearLayer = this._getDOMRef('backgroundRearLayer');
      fx.backgroundFrontLayer.style.willChange = 'opacity';
      fx.backgroundFrontLayer.style.transform = 'translateZ(0)';
      fx.backgroundRearLayer.style.willChange = 'opacity';
      fx.backgroundRearLayer.style.transform = 'translateZ(0)';
      fx.backgroundRearLayer.style.opacity = 0;
      this._fxBlendBackground = fx;
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    run: function run(p, y) {
      var fx = this._fxBlendBackground;
      fx.backgroundFrontLayer.style.opacity = 1 - p;
      fx.backgroundRearLayer.style.opacity = p;
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    tearDown: function tearDown() {
      delete this._fxBlendBackground;
    }
  });
/**
   * Upon scrolling past a threshold, fade in the rear background layer and fade out the front
   * background layer (opacity CSS transitioned over time).
   *
   *
   */
  Polymer.AppLayout.registerEffect('fade-background', {
    /** @this Polymer.AppLayout.ElementWithBackground */
    setUp: function setUp(config) {
      var fx = {};
      var duration = config.duration || '0.5s';
      fx.backgroundFrontLayer = this._getDOMRef('backgroundFrontLayer');
      fx.backgroundRearLayer = this._getDOMRef('backgroundRearLayer');
      fx.backgroundFrontLayer.style.willChange = 'opacity';
      fx.backgroundFrontLayer.style.webkitTransform = 'translateZ(0)';
      fx.backgroundFrontLayer.style.transitionProperty = 'opacity';
      fx.backgroundFrontLayer.style.transitionDuration = duration;
      fx.backgroundRearLayer.style.willChange = 'opacity';
      fx.backgroundRearLayer.style.webkitTransform = 'translateZ(0)';
      fx.backgroundRearLayer.style.transitionProperty = 'opacity';
      fx.backgroundRearLayer.style.transitionDuration = duration;
      this._fxFadeBackground = fx;
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    run: function run(p, y) {
      var fx = this._fxFadeBackground;
      if (p >= 1) {
        fx.backgroundFrontLayer.style.opacity = 0;
        fx.backgroundRearLayer.style.opacity = 1;
      } else {
        fx.backgroundFrontLayer.style.opacity = 1;
        fx.backgroundRearLayer.style.opacity = 0;
      }
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    tearDown: function tearDown() {
      delete this._fxFadeBackground;
    }
  });
/**
   * Toggles the shadow property in app-header when content is scrolled to create a sense of depth
   * between the element and the content underneath.
   */
  Polymer.AppLayout.registerEffect('waterfall', {
    /**
     *  @this Polymer.AppLayout.ElementWithBackground
     */
    run: function run() {
      this.shadow = this.isOnScreen() && this.isContentBelow();
    }
  });
(function() {
    function interpolate(progress, points, fn, ctx) {
      fn.apply(ctx, points.map(function(point) {
        return point[0] + (point[1] - point[0]) * progress;
      }));
    }

    /**
     * Transform the font size of a designated title element between two values based on the scroll
     * position.
     */
    Polymer.AppLayout.registerEffect('resize-title', {
      /** @this Polymer.AppLayout.ElementWithBackground */
      setUp: function setUp() {
        var title = this._getDOMRef('mainTitle');
        var condensedTitle = this._getDOMRef('condensedTitle');

        if (!condensedTitle) {
          console.warn('Scroll effect `resize-title`: undefined `condensed-title`');
          return false;
        }
        if (!title) {
          console.warn('Scroll effect `resize-title`: undefined `main-title`');
          return false;
        }

        condensedTitle.style.willChange = 'opacity';
        title.style.willChange = 'opacity';
        condensedTitle.style.webkitTransform = 'translateZ(0)';
        title.style.webkitTransform = 'translateZ(0)';
        condensedTitle.style.transform = 'translateZ(0)';
        title.style.transform = 'translateZ(0)';

        var titleClientRect = title.getBoundingClientRect();
        var condensedTitleClientRect = condensedTitle.getBoundingClientRect();
        var fx = {};

        fx.scale = parseInt(window.getComputedStyle(condensedTitle)['font-size'], 10) /
            parseInt(window.getComputedStyle(title)['font-size'], 10);
        fx.titleDX = titleClientRect.left - condensedTitleClientRect.left;
        fx.titleDY = titleClientRect.top - condensedTitleClientRect.top;
        fx.condensedTitle = condensedTitle;
        fx.title = title;

        this._fxResizeTitle = fx;
      },
      /** @this PolymerElement */
      run: function run(p, y) {
        var fx = this._fxResizeTitle;
        if (!this.condenses) {
          y = 0;
        }
        if (p >= 1) {
          fx.title.style.opacity = 0;
          fx.condensedTitle.style.opacity = 1;
        } else {
          fx.title.style.opacity = 1;
          fx.condensedTitle.style.opacity = 0;
        }
        interpolate(Math.min(1, p), [ [1, fx.scale], [0, -fx.titleDX], [y, y-fx.titleDY] ],
          function(scale, translateX, translateY) {
            this.transform('translate(' + translateX + 'px, ' + translateY + 'px) ' +
                'scale3d(' + scale + ', ' + scale + ', 1)', fx.title);
          }, this);
      },
      /** @this Polymer.AppLayout.ElementWithBackground */
      tearDown: function tearDown() {
        delete this._fxResizeTitle;
      }
    });
  })();
/**
   * Vertically translate the background based on a factor of the scroll position.
   */
  Polymer.AppLayout.registerEffect('parallax-background', {
    /**
     * @param {{scalar: string}} config
     * @this Polymer.AppLayout.ElementWithBackground
     */
    setUp: function setUp(config) {
      var fx = {};
      var scalar = parseFloat(config.scalar);
      fx.background = this._getDOMRef('background');
      fx.backgroundFrontLayer = this._getDOMRef('backgroundFrontLayer');
      fx.backgroundRearLayer = this._getDOMRef('backgroundRearLayer');
      fx.deltaBg = fx.backgroundFrontLayer.offsetHeight - fx.background.offsetHeight;
      if (fx.deltaBg === 0) {
        if (isNaN(scalar)) {
          scalar = 0.8;
        }
        fx.deltaBg = this._dHeight * scalar;
      } else {
        if (isNaN(scalar)) {
          scalar = 1;
        }
        fx.deltaBg = fx.deltaBg * scalar;
      }
      this._fxParallaxBackground = fx;
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    run: function run(p, y) {
      var fx = this._fxParallaxBackground;
      this.transform('translate3d(0px, ' + (fx.deltaBg * Math.min(1, p)) + 'px, 0px)', fx.backgroundFrontLayer);
      if (fx.backgroundRearLayer) {
        this.transform('translate3d(0px, ' + (fx.deltaBg * Math.min(1, p)) + 'px, 0px)', fx.backgroundRearLayer);
      }
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    tearDown: function tearDown() {
      delete this._fxParallaxBackground;
    }
  });
/**
   * Shorthand for the waterfall, resize-title, blend-background, and parallax-background effects.
   */
  Polymer.AppLayout.registerEffect('material', {
    /**
     * @this Polymer.AppLayout.ElementWithBackground
     */
    setUp: function setUp() {
      this.effects = 'waterfall resize-title blend-background parallax-background';
      return false;
    }
  });
/**
   * Upon scrolling past a threshold, CSS transition the font size of a designated title element
   * between two values.
   */
  Polymer.AppLayout.registerEffect('resize-snapped-title', {
    /**
     * @this Polymer.AppLayout.ElementWithBackground
     */
    setUp: function setUp(config) {
      var title = this._getDOMRef('mainTitle');
      var condensedTitle = this._getDOMRef('condensedTitle');
      var duration = config.duration || '0.2s';
      var fx = {};

      if (!condensedTitle) {
        console.warn('Scroll effect `resize-snapped-title`: undefined `condensed-title`');
        return false;
      }
      if (!title) {
        console.warn('Scroll effect `resize-snapped-title`: undefined `main-title`');
        return false;
      }

      title.style.transitionProperty = 'opacity';
      title.style.transitionDuration = duration;
      condensedTitle.style.transitionProperty = 'opacity';
      condensedTitle.style.transitionDuration = duration;
      fx.condensedTitle = condensedTitle;
      fx.title = title;
      this._fxResizeSnappedTitle = fx;
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    run: function run(p, y) {
      var fx = this._fxResizeSnappedTitle;
      if (p > 0) {
        fx.title.style.opacity = 0;
        fx.condensedTitle.style.opacity = 1;
      } else {
        fx.title.style.opacity = 1;
        fx.condensedTitle.style.opacity = 0;
      }
    },
    /** @this Polymer.AppLayout.ElementWithBackground */
    tearDown: function tearDown() {
      var fx = this._fxResizeSnappedTitle;
      fx.title.style.transition = '';
      fx.condensedTitle.style.transition = '';
      delete this._fxResizeSnappedTitle;
    }
  });
Polymer({
      is: 'app-toolbar'
    });
(function() {
    'use strict';

    Polymer({
      is: 'iron-location',
      properties: {
        /**
         * The pathname component of the URL.
         */
        path: {
          type: String,
          notify: true,
          value: function() {
            return window.decodeURIComponent(window.location.pathname);
          }
        },
        /**
         * The query string portion of the URL.
         */
        query: {
          type: String,
          notify: true,
          value: function() {
            return window.location.search.slice(1);
          }
        },
        /**
         * The hash component of the URL.
         */
        hash: {
          type: String,
          notify: true,
          value: function() {
            return window.decodeURIComponent(window.location.hash.slice(1));
          }
        },
        /**
         * If the user was on a URL for less than `dwellTime` milliseconds, it
         * won't be added to the browser's history, but instead will be replaced
         * by the next entry.
         *
         * This is to prevent large numbers of entries from clogging up the user's
         * browser history. Disable by setting to a negative number.
         */
        dwellTime: {
          type: Number,
          value: 2000
        },

        /**
         * A regexp that defines the set of URLs that should be considered part
         * of this web app.
         *
         * Clicking on a link that matches this regex won't result in a full page
         * navigation, but will instead just update the URL state in place.
         *
         * This regexp is given everything after the origin in an absolute
         * URL. So to match just URLs that start with /search/ do:
         *     url-space-regex="^/search/"
         *
         * @type {string|RegExp}
         */
        urlSpaceRegex: {
          type: String,
          value: ''
        },

        /**
         * urlSpaceRegex, but coerced into a regexp.
         *
         * @type {RegExp}
         */
        _urlSpaceRegExp: {
          computed: '_makeRegExp(urlSpaceRegex)'
        },

        _lastChangedAt: {
          type: Number
        },

        _initialized: {
          type: Boolean,
          value: false
        }
      },
      hostAttributes: {
        hidden: true
      },
      observers: [
        '_updateUrl(path, query, hash)'
      ],
      attached: function() {
        this.listen(window, 'hashchange', '_hashChanged');
        this.listen(window, 'location-changed', '_urlChanged');
        this.listen(window, 'popstate', '_urlChanged');
        this.listen(/** @type {!HTMLBodyElement} */(document.body), 'click', '_globalOnClick');
        // Give a 200ms grace period to make initial redirects without any
        // additions to the user's history.
        this._lastChangedAt = window.performance.now() - (this.dwellTime - 200);

        this._initialized = true;
        this._urlChanged();
      },
      detached: function() {
        this.unlisten(window, 'hashchange', '_hashChanged');
        this.unlisten(window, 'location-changed', '_urlChanged');
        this.unlisten(window, 'popstate', '_urlChanged');
        this.unlisten(/** @type {!HTMLBodyElement} */(document.body), 'click', '_globalOnClick');
        this._initialized = false;
      },
      _hashChanged: function() {
        this.hash = window.decodeURIComponent(window.location.hash.substring(1));
      },
      _urlChanged: function() {
        // We want to extract all info out of the updated URL before we
        // try to write anything back into it.
        //
        // i.e. without _dontUpdateUrl we'd overwrite the new path with the old
        // one when we set this.hash. Likewise for query.
        this._dontUpdateUrl = true;
        this._hashChanged();
        this.path = window.decodeURIComponent(window.location.pathname);
        this.query = window.location.search.substring(1);
        this._dontUpdateUrl = false;
        this._updateUrl();
      },
      _getUrl: function() {
        var partiallyEncodedPath = window.encodeURI(
            this.path).replace(/\#/g, '%23').replace(/\?/g, '%3F');
        var partiallyEncodedQuery = '';
        if (this.query) {
          partiallyEncodedQuery = '?' + this.query.replace(/\#/g, '%23');
        }
        var partiallyEncodedHash = '';
        if (this.hash) {
          partiallyEncodedHash = '#' + window.encodeURI(this.hash);
        }
        return (
            partiallyEncodedPath + partiallyEncodedQuery + partiallyEncodedHash);
      },
      _updateUrl: function() {
        if (this._dontUpdateUrl || !this._initialized) {
          return;
        }
        if (this.path === window.decodeURIComponent(window.location.pathname) &&
            this.query === window.location.search.substring(1) &&
            this.hash === window.decodeURIComponent(
                window.location.hash.substring(1))) {
          // Nothing to do, the current URL is a representation of our properties.
          return;
        }
        var newUrl = this._getUrl();
        // Need to use a full URL in case the containing page has a base URI.
        var fullNewUrl = new URL(
            newUrl, window.location.protocol + '//' + window.location.host).href;
        var now = window.performance.now();
        var shouldReplace =
            this._lastChangedAt + this.dwellTime > now;
        this._lastChangedAt = now;
        if (shouldReplace) {
          window.history.replaceState({}, '', fullNewUrl);
        } else {
          window.history.pushState({}, '', fullNewUrl);
        }
        this.fire('location-changed', {}, {node: window});
      },
      /**
       * A necessary evil so that links work as expected. Does its best to
       * bail out early if possible.
       *
       * @param {MouseEvent} event .
       */
      _globalOnClick: function(event) {
        // If another event handler has stopped this event then there's nothing
        // for us to do. This can happen e.g. when there are multiple
        // iron-location elements in a page.
        if (event.defaultPrevented) {
          return;
        }
        var href = this._getSameOriginLinkHref(event);
        if (!href) {
          return;
        }
        event.preventDefault();
        // If the navigation is to the current page we shouldn't add a history
        // entry or fire a change event.
        if (href === window.location.href) {
          return;
        }
        window.history.pushState({}, '', href);
        this.fire('location-changed', {}, {node: window});
      },
      /**
       * Returns the absolute URL of the link (if any) that this click event
       * is clicking on, if we can and should override the resulting full
       * page navigation. Returns null otherwise.
       *
       * @param {MouseEvent} event .
       * @return {string?} .
       */
      _getSameOriginLinkHref: function(event) {
        // We only care about left-clicks.
        if (event.button !== 0) {
          return null;
        }
        // We don't want modified clicks, where the intent is to open the page
        // in a new tab.
        if (event.metaKey || event.ctrlKey) {
          return null;
        }
        var eventPath = Polymer.dom(event).path;
        var anchor = null;
        for (var i = 0; i < eventPath.length; i++) {
          var element = eventPath[i];
          if (element.tagName === 'A' && element.href) {
            anchor = element;
            break;
          }
        }

        // If there's no link there's nothing to do.
        if (!anchor) {
          return null;
        }

        // Target blank is a new tab, don't intercept.
        if (anchor.target === '_blank') {
          return null;
        }
        // If the link is for an existing parent frame, don't intercept.
        if ((anchor.target === '_top' ||
             anchor.target === '_parent') &&
            window.top !== window) {
          return null;
        }

        var href = anchor.href;

        // It only makes sense for us to intercept same-origin navigations.
        // pushState/replaceState don't work with cross-origin links.
        var url;
        if (document.baseURI != null) {
          url = new URL(href, /** @type {string} */(document.baseURI));
        } else {
          url = new URL(href);
        }

        var origin;

        // IE Polyfill
        if (window.location.origin) {
          origin = window.location.origin;
        } else {
          origin = window.location.protocol + '//' + window.location.hostname;

          if (window.location.port) {
            origin += ':' + window.location.port;
          }
        }

        if (url.origin !== origin) {
          return null;
        }
        var normalizedHref = url.pathname + url.search + url.hash;

        // If we've been configured not to handle this url... don't handle it!
        if (this._urlSpaceRegExp &&
            !this._urlSpaceRegExp.test(normalizedHref)) {
          return null;
        }
        // Need to use a full URL in case the containing page has a base URI.
        var fullNormalizedHref = new URL(
            normalizedHref, window.location.href).href;
        return fullNormalizedHref;
      },
      _makeRegExp: function(urlSpaceRegex) {
        return RegExp(urlSpaceRegex);
      }
    });
  })();
'use strict';

  Polymer({
    is: 'iron-query-params',
    properties: {
      paramsString: {
        type: String,
        notify: true,
        observer: 'paramsStringChanged',
      },
      paramsObject: {
        type: Object,
        notify: true,
        value: function() {
          return {};
        }
      },
      _dontReact: {
        type: Boolean,
        value: false
      }
    },
    hostAttributes: {
      hidden: true
    },
    observers: [
      'paramsObjectChanged(paramsObject.*)'
    ],
    paramsStringChanged: function() {
      this._dontReact = true;
      this.paramsObject = this._decodeParams(this.paramsString);
      this._dontReact = false;
    },
    paramsObjectChanged: function() {
      if (this._dontReact) {
        return;
      }
      this.paramsString = this._encodeParams(this.paramsObject)
          .replace(/%3F/g, '?').replace(/%2F/g, '/');
    },
    _encodeParams: function(params) {
      var encodedParams = [];
      for (var key in params) {
        var value = params[key];
        if (value === '') {
          encodedParams.push(encodeURIComponent(key));
        } else if (value) {
          encodedParams.push(
              encodeURIComponent(key) +
              '=' +
              encodeURIComponent(value.toString())
          );
        }
      }
      return encodedParams.join('&');
    },
    _decodeParams: function(paramString) {
      var params = {};

      // Work around a bug in decodeURIComponent where + is not
      // converted to spaces:
      paramString = (paramString || '').replace(/\+/g, '%20');

      var paramList = paramString.split('&');
      for (var i = 0; i < paramList.length; i++) {
        var param = paramList[i].split('=');
        if (param[0]) {
          params[decodeURIComponent(param[0])] =
              decodeURIComponent(param[1] || '');
        }
      }
      return params;
    }
  });
(function() {
    'use strict';

    /**
     * Provides bidirectional mapping between `path` and `queryParams` and a
     * app-route compatible `route` object.
     *
     * For more information, see the docs for `app-route-converter`.
     *
     * @polymerBehavior
     */
    Polymer.AppRouteConverterBehavior = {
      properties: {
        /**
         * A model representing the deserialized path through the route tree, as
         * well as the current queryParams.
         *
         * A route object is the kernel of the routing system. It is intended to
         * be fed into consuming elements such as `app-route`.
         *
         * @type {?Object}
         */
        route: {
          type: Object,
          notify: true
        },

        /**
         * A set of key/value pairs that are universally accessible to branches of
         * the route tree.
         *
         * @type {?Object}
         */
        queryParams: {
          type: Object,
          notify: true
        },

        /**
         * The serialized path through the route tree. This corresponds to the
         * `window.location.pathname` value, and will update to reflect changes
         * to that value.
         */
        path: {
          type: String,
          notify: true,
        }
      },

      observers: [
        '_locationChanged(path, queryParams)',
        '_routeChanged(route.prefix, route.path)',
        '_routeQueryParamsChanged(route.__queryParams)'
      ],

      created: function() {
        this.linkPaths('route.__queryParams', 'queryParams');
        this.linkPaths('queryParams', 'route.__queryParams');
      },

      /**
       * Handler called when the path or queryParams change.
       */
      _locationChanged: function() {
        if (this.route &&
            this.route.path === this.path &&
            this.queryParams === this.route.__queryParams) {
          return;
        }
        this.route = {
          prefix: '',
          path: this.path,
          __queryParams: this.queryParams
        };
      },

      /**
       * Handler called when the route prefix and route path change.
       */
      _routeChanged: function() {
        if (!this.route) {
          return;
        }

        this.path = this.route.prefix + this.route.path;
      },

      /**
       * Handler called when the route queryParams change.
       *
       * @param  {Object} queryParams A set of key/value pairs that are
       * universally accessible to branches of the route tree.
       */
      _routeQueryParamsChanged: function(queryParams) {
        if (!this.route) {
          return;
        }
        this.queryParams = queryParams;
      }
    };
  })();
(function() {
      'use strict';

      Polymer({
        is: 'app-location',

        properties: {
          /**
           * A model representing the deserialized path through the route tree, as
           * well as the current queryParams.
           */
          route: {
            type: Object,
            notify: true
          },

          /**
           * In many scenarios, it is convenient to treat the `hash` as a stand-in
           * alternative to the `path`. For example, if deploying an app to a static
           * web server (e.g., Github Pages) - where one does not have control over
           * server-side routing - it is usually a better experience to use the hash
           * to represent paths through one's app.
           *
           * When this property is set to true, the `hash` will be used in place of

           * the `path` for generating a `route`.
           */
          useHashAsPath: {
            type: Boolean,
            value: false
          },

          /**
           * A regexp that defines the set of URLs that should be considered part
           * of this web app.
           *
           * Clicking on a link that matches this regex won't result in a full page
           * navigation, but will instead just update the URL state in place.
           *
           * This regexp is given everything after the origin in an absolute
           * URL. So to match just URLs that start with /search/ do:
           *     url-space-regex="^/search/"
           *
           * @type {string|RegExp}
           */
          urlSpaceRegex: {
            type: String,
            notify: true
          },

          /**
           * A set of key/value pairs that are universally accessible to branches
           * of the route tree.
           */
          __queryParams: {
            type: Object
          },

          /**
           * The pathname component of the current URL.
           */
          __path: {
            type: String
          },

          /**
           * The query string portion of the current URL.
           */
          __query: {
            type: String
          },

          /**
           * The hash portion of the current URL.
           */
          __hash: {
            type: String
          },

          /**
           * The route path, which will be either the hash or the path, depending
           * on useHashAsPath.
           */
          path: {
            type: String,
            observer: '__onPathChanged'
          }
        },

        behaviors: [Polymer.AppRouteConverterBehavior],

        observers: [
          '__computeRoutePath(useHashAsPath, __hash, __path)'
        ],

        __computeRoutePath: function() {
          this.path = this.useHashAsPath ? this.__hash : this.__path;
        },

        __onPathChanged: function() {
          if (!this._readied) {
            return;
          }

          if (this.useHashAsPath) {
            this.__hash = this.path;
          } else {
            this.__path = this.path;
          }
        }
      });
    })();
(function() {
    'use strict';

    Polymer({
      is: 'app-route',

      properties: {
        /**
         * The URL component managed by this element.
         */
        route: {
          type: Object,
          notify: true
        },

        /**
         * The pattern of slash-separated segments to match `path` against.
         *
         * For example the pattern "/foo" will match "/foo" or "/foo/bar"
         * but not "/foobar".
         *
         * Path segments like `/:named` are mapped to properties on the `data` object.
         */
        pattern: {
          type: String
        },

        /**
         * The parameterized values that are extracted from the route as
         * described by `pattern`.
         */
        data: {
          type: Object,
          value: function() {return {};},
          notify: true
        },

        /**
         * @type {?Object}
         */
        queryParams: {
          type: Object,
          value: function() {
            return {};
          },
          notify: true
        },

        /**
         * The part of `path` NOT consumed by `pattern`.
         */
        tail: {
          type: Object,
          value: function() {return {path: null, prefix: null, __queryParams: null};},
          notify: true
        },

        active: {
          type: Boolean,
          notify: true,
          readOnly: true
        },

        _queryParamsUpdating: {
          type: Boolean,
          value: false
        },
        /**
         * @type {?string}
         */
        _matched: {
          type: String,
          value: ''
        }
      },

      observers: [
        '__tryToMatch(route.path, pattern)',
        '__updatePathOnDataChange(data.*)',
        '__tailPathChanged(tail.path)',
        '__routeQueryParamsChanged(route.__queryParams)',
        '__tailQueryParamsChanged(tail.__queryParams)',
        '__queryParamsChanged(queryParams.*)'
      ],

      created: function() {
        this.linkPaths('route.__queryParams', 'tail.__queryParams');
        this.linkPaths('tail.__queryParams', 'route.__queryParams');
      },

      /**
       * Deal with the query params object being assigned to wholesale.
       * @export
       */
      __routeQueryParamsChanged: function(queryParams) {
        if (queryParams && this.tail) {
          this.set('tail.__queryParams', queryParams);

          if (!this.active || this._queryParamsUpdating) {
            return;
          }

          // Copy queryParams and track whether there are any differences compared
          // to the existing query params.
          var copyOfQueryParams = {};
          var anythingChanged = false;
          for (var key in queryParams) {
            copyOfQueryParams[key] = queryParams[key];
            if (anythingChanged ||
                !this.queryParams ||
                queryParams[key] !== this.queryParams[key]) {
              anythingChanged = true;
            }
          }
          // Need to check whether any keys were deleted
          for (var key in this.queryParams) {
            if (anythingChanged || !(key in queryParams)) {
              anythingChanged = true;
              break;
            }
          }

          if (!anythingChanged) {
            return;
          }
          this._queryParamsUpdating = true;
          this.set('queryParams', copyOfQueryParams);
          this._queryParamsUpdating = false;
        }
      },

      /**
       * @export
       */
      __tailQueryParamsChanged: function(queryParams) {
        if (queryParams && this.route) {
          this.set('route.__queryParams', queryParams);
        }
      },

      /**
       * @export
       */
      __queryParamsChanged: function(changes) {
        if (!this.active || this._queryParamsUpdating) {
          return;
        }

        this.set('route.__' + changes.path, changes.value);
      },

      __resetProperties: function() {
        this._setActive(false);
        this._matched = null;
        //this.tail = { path: null, prefix: null, queryParams: null };
        //this.data = {};
      },

      /**
       * @export
       */
      __tryToMatch: function() {
        if (!this.route) {
          return;
        }
        var path = this.route.path;
        var pattern = this.pattern;
        if (!pattern) {
          return;
        }

        if (!path) {
          this.__resetProperties();
          return;
        }

        var remainingPieces = path.split('/');
        var patternPieces = pattern.split('/');

        var matched = [];
        var namedMatches = {};

        for (var i=0; i < patternPieces.length; i++) {
          var patternPiece = patternPieces[i];
          if (!patternPiece && patternPiece !== '') {
            break;
          }
          var pathPiece = remainingPieces.shift();

          // We don't match this path.
          if (!pathPiece && pathPiece !== '') {
            this.__resetProperties();
            return;
          }
          matched.push(pathPiece);

          if (patternPiece.charAt(0) == ':') {
            namedMatches[patternPiece.slice(1)] = pathPiece;
          } else if (patternPiece !== pathPiece) {
            this.__resetProperties();
            return;
          }
        }

        this._matched = matched.join('/');

        // Properties that must be updated atomically.
        var propertyUpdates = {};

        //this.active
        if (!this.active) {
          propertyUpdates.active = true;
        }

        // this.tail
        var tailPrefix = this.route.prefix + this._matched;
        var tailPath = remainingPieces.join('/');
        if (remainingPieces.length > 0) {
          tailPath = '/' + tailPath;
        }
        if (!this.tail ||
            this.tail.prefix !== tailPrefix ||
            this.tail.path !== tailPath) {
          propertyUpdates.tail = {
            prefix: tailPrefix,
            path: tailPath,
            __queryParams: this.route.__queryParams
          };
        }

        // this.data
        propertyUpdates.data = namedMatches;
        this._dataInUrl = {};
        for (var key in namedMatches) {
          this._dataInUrl[key] = namedMatches[key];
        }

        this.__setMulti(propertyUpdates);
      },

      /**
       * @export
       */
      __tailPathChanged: function(path) {
        if (!this.active) {
          return;
        }
        var tailPath = path;
        var newPath = this._matched;
        if (tailPath) {
          if (tailPath.charAt(0) !== '/') {
            tailPath = '/' + tailPath;
          }
          newPath += tailPath;
        }
        this.set('route.path', newPath);
      },

      /**
       * @export
       */
      __updatePathOnDataChange: function() {
        if (!this.route || !this.active) {
          return;
        }
        var newPath = this.__getLink({});
        var oldPath = this.__getLink(this._dataInUrl);
        if (newPath === oldPath) {
          return;
        }
        this.set('route.path', newPath);
      },

      __getLink: function(overrideValues) {
        var values = {tail: null};
        for (var key in this.data) {
          values[key] = this.data[key];
        }
        for (var key in overrideValues) {
          values[key] = overrideValues[key];
        }
        var patternPieces = this.pattern.split('/');
        var interp = patternPieces.map(function(value) {
          if (value[0] == ':') {
            value = values[value.slice(1)];
          }
          return value;
        }, this);
        if (values.tail && values.tail.path) {
          if (interp.length > 0 && values.tail.path.charAt(0) === '/') {
            interp.push(values.tail.path.slice(1));
          } else {
            interp.push(values.tail.path);
          }
        }
        return interp.join('/');
      },

      __setMulti: function(setObj) {
        // HACK(rictic): skirting around 1.0's lack of a setMulti by poking at
        //     internal data structures. I would not advise that you copy this
        //     example.
        //
        //     In the future this will be a feature of Polymer itself.
        //     See: https://github.com/Polymer/polymer/issues/3640
        //
        //     Hacking around with private methods like this is juggling footguns,
        //     and is likely to have unexpected and unsupported rough edges.
        //
        //     Be ye so warned.
        for (var property in setObj) {
          this._propertySetter(property, setObj[property]);
        }
        //notify in a specific order
        if (setObj.data !== undefined) {
          this._pathEffector('data', this.data);
          this._notifyChange('data');
        }
        if (setObj.active !== undefined) {
          this._pathEffector('active', this.active);
          this._notifyChange('active');
        }
        if (setObj.tail !== undefined) {
          this._pathEffector('tail', this.tail);
          this._notifyChange('tail');
        }

      }
    });
  })();
/**
   * @param {!Function} selectCallback
   * @constructor
   */
  Polymer.IronSelection = function(selectCallback) {
    this.selection = [];
    this.selectCallback = selectCallback;
  };

  Polymer.IronSelection.prototype = {

    /**
     * Retrieves the selected item(s).
     *
     * @method get
     * @returns Returns the selected item(s). If the multi property is true,
     * `get` will return an array, otherwise it will return
     * the selected item or undefined if there is no selection.
     */
    get: function() {
      return this.multi ? this.selection.slice() : this.selection[0];
    },

    /**
     * Clears all the selection except the ones indicated.
     *
     * @method clear
     * @param {Array} excludes items to be excluded.
     */
    clear: function(excludes) {
      this.selection.slice().forEach(function(item) {
        if (!excludes || excludes.indexOf(item) < 0) {
          this.setItemSelected(item, false);
        }
      }, this);
    },

    /**
     * Indicates if a given item is selected.
     *
     * @method isSelected
     * @param {*} item The item whose selection state should be checked.
     * @returns Returns true if `item` is selected.
     */
    isSelected: function(item) {
      return this.selection.indexOf(item) >= 0;
    },

    /**
     * Sets the selection state for a given item to either selected or deselected.
     *
     * @method setItemSelected
     * @param {*} item The item to select.
     * @param {boolean} isSelected True for selected, false for deselected.
     */
    setItemSelected: function(item, isSelected) {
      if (item != null) {
        if (isSelected !== this.isSelected(item)) {
          // proceed to update selection only if requested state differs from current
          if (isSelected) {
            this.selection.push(item);
          } else {
            var i = this.selection.indexOf(item);
            if (i >= 0) {
              this.selection.splice(i, 1);
            }
          }
          if (this.selectCallback) {
            this.selectCallback(item, isSelected);
          }
        }
      }
    },

    /**
     * Sets the selection state for a given item. If the `multi` property
     * is true, then the selected state of `item` will be toggled; otherwise
     * the `item` will be selected.
     *
     * @method select
     * @param {*} item The item to select.
     */
    select: function(item) {
      if (this.multi) {
        this.toggle(item);
      } else if (this.get() !== item) {
        this.setItemSelected(this.get(), false);
        this.setItemSelected(item, true);
      }
    },

    /**
     * Toggles the selection state for `item`.
     *
     * @method toggle
     * @param {*} item The item to toggle.
     */
    toggle: function(item) {
      this.setItemSelected(item, !this.isSelected(item));
    }

  };
/** @polymerBehavior */
  Polymer.IronSelectableBehavior = {

      /**
       * Fired when iron-selector is activated (selected or deselected).
       * It is fired before the selected items are changed.
       * Cancel the event to abort selection.
       *
       * @event iron-activate
       */

      /**
       * Fired when an item is selected
       *
       * @event iron-select
       */

      /**
       * Fired when an item is deselected
       *
       * @event iron-deselect
       */

      /**
       * Fired when the list of selectable items changes (e.g., items are
       * added or removed). The detail of the event is a mutation record that
       * describes what changed.
       *
       * @event iron-items-changed
       */

    properties: {

      /**
       * If you want to use an attribute value or property of an element for
       * `selected` instead of the index, set this to the name of the attribute
       * or property. Hyphenated values are converted to camel case when used to
       * look up the property of a selectable element. Camel cased values are
       * *not* converted to hyphenated values for attribute lookup. It's
       * recommended that you provide the hyphenated form of the name so that
       * selection works in both cases. (Use `attr-or-property-name` instead of
       * `attrOrPropertyName`.)
       */
      attrForSelected: {
        type: String,
        value: null
      },

      /**
       * Gets or sets the selected element. The default is to use the index of the item.
       * @type {string|number}
       */
      selected: {
        type: String,
        notify: true
      },

      /**
       * Returns the currently selected item.
       *
       * @type {?Object}
       */
      selectedItem: {
        type: Object,
        readOnly: true,
        notify: true
      },

      /**
       * The event that fires from items when they are selected. Selectable
       * will listen for this event from items and update the selection state.
       * Set to empty string to listen to no events.
       */
      activateEvent: {
        type: String,
        value: 'tap',
        observer: '_activateEventChanged'
      },

      /**
       * This is a CSS selector string.  If this is set, only items that match the CSS selector
       * are selectable.
       */
      selectable: String,

      /**
       * The class to set on elements when selected.
       */
      selectedClass: {
        type: String,
        value: 'iron-selected'
      },

      /**
       * The attribute to set on elements when selected.
       */
      selectedAttribute: {
        type: String,
        value: null
      },

      /**
       * Default fallback if the selection based on selected with `attrForSelected`
       * is not found.
       */
      fallbackSelection: {
        type: String,
        value: null
      },

      /**
       * The list of items from which a selection can be made.
       */
      items: {
        type: Array,
        readOnly: true,
        notify: true,
        value: function() {
          return [];
        }
      },

      /**
       * The set of excluded elements where the key is the `localName`
       * of the element that will be ignored from the item list.
       *
       * @default {template: 1}
       */
      _excludedLocalNames: {
        type: Object,
        value: function() {
          return {
            'template': 1
          };
        }
      }
    },

    observers: [
      '_updateAttrForSelected(attrForSelected)',
      '_updateSelected(selected)',
      '_checkFallback(fallbackSelection)'
    ],

    created: function() {
      this._bindFilterItem = this._filterItem.bind(this);
      this._selection = new Polymer.IronSelection(this._applySelection.bind(this));
    },

    attached: function() {
      this._observer = this._observeItems(this);
      this._updateItems();
      if (!this._shouldUpdateSelection) {
        this._updateSelected();
      }
      this._addListener(this.activateEvent);
    },

    detached: function() {
      if (this._observer) {
        Polymer.dom(this).unobserveNodes(this._observer);
      }
      this._removeListener(this.activateEvent);
    },

    /**
     * Returns the index of the given item.
     *
     * @method indexOf
     * @param {Object} item
     * @returns Returns the index of the item
     */
    indexOf: function(item) {
      return this.items.indexOf(item);
    },

    /**
     * Selects the given value.
     *
     * @method select
     * @param {string|number} value the value to select.
     */
    select: function(value) {
      this.selected = value;
    },

    /**
     * Selects the previous item.
     *
     * @method selectPrevious
     */
    selectPrevious: function() {
      var length = this.items.length;
      var index = (Number(this._valueToIndex(this.selected)) - 1 + length) % length;
      this.selected = this._indexToValue(index);
    },

    /**
     * Selects the next item.
     *
     * @method selectNext
     */
    selectNext: function() {
      var index = (Number(this._valueToIndex(this.selected)) + 1) % this.items.length;
      this.selected = this._indexToValue(index);
    },

    /**
     * Selects the item at the given index.
     *
     * @method selectIndex
     */
    selectIndex: function(index) {
      this.select(this._indexToValue(index));
    },

    /**
     * Force a synchronous update of the `items` property.
     *
     * NOTE: Consider listening for the `iron-items-changed` event to respond to
     * updates to the set of selectable items after updates to the DOM list and
     * selection state have been made.
     *
     * WARNING: If you are using this method, you should probably consider an
     * alternate approach. Synchronously querying for items is potentially
     * slow for many use cases. The `items` property will update asynchronously
     * on its own to reflect selectable items in the DOM.
     */
    forceSynchronousItemUpdate: function() {
      this._updateItems();
    },

    get _shouldUpdateSelection() {
      return this.selected != null;
    },

    _checkFallback: function() {
      if (this._shouldUpdateSelection) {
        this._updateSelected();
      }
    },

    _addListener: function(eventName) {
      this.listen(this, eventName, '_activateHandler');
    },

    _removeListener: function(eventName) {
      this.unlisten(this, eventName, '_activateHandler');
    },

    _activateEventChanged: function(eventName, old) {
      this._removeListener(old);
      this._addListener(eventName);
    },

    _updateItems: function() {
      var nodes = Polymer.dom(this).queryDistributedElements(this.selectable || '*');
      nodes = Array.prototype.filter.call(nodes, this._bindFilterItem);
      this._setItems(nodes);
    },

    _updateAttrForSelected: function() {
      if (this._shouldUpdateSelection) {
        this.selected = this._indexToValue(this.indexOf(this.selectedItem));
      }
    },

    _updateSelected: function() {
      this._selectSelected(this.selected);
    },

    _selectSelected: function(selected) {
      this._selection.select(this._valueToItem(this.selected));
      // Check for items, since this array is populated only when attached
      // Since Number(0) is falsy, explicitly check for undefined
      if (this.fallbackSelection && this.items.length && (this._selection.get() === undefined)) {
        this.selected = this.fallbackSelection;
      }
    },

    _filterItem: function(node) {
      return !this._excludedLocalNames[node.localName];
    },

    _valueToItem: function(value) {
      return (value == null) ? null : this.items[this._valueToIndex(value)];
    },

    _valueToIndex: function(value) {
      if (this.attrForSelected) {
        for (var i = 0, item; item = this.items[i]; i++) {
          if (this._valueForItem(item) == value) {
            return i;
          }
        }
      } else {
        return Number(value);
      }
    },

    _indexToValue: function(index) {
      if (this.attrForSelected) {
        var item = this.items[index];
        if (item) {
          return this._valueForItem(item);
        }
      } else {
        return index;
      }
    },

    _valueForItem: function(item) {
      var propValue = item[Polymer.CaseMap.dashToCamelCase(this.attrForSelected)];
      return propValue != undefined ? propValue : item.getAttribute(this.attrForSelected);
    },

    _applySelection: function(item, isSelected) {
      if (this.selectedClass) {
        this.toggleClass(this.selectedClass, isSelected, item);
      }
      if (this.selectedAttribute) {
        this.toggleAttribute(this.selectedAttribute, isSelected, item);
      }
      this._selectionChange();
      this.fire('iron-' + (isSelected ? 'select' : 'deselect'), {item: item});
    },

    _selectionChange: function() {
      this._setSelectedItem(this._selection.get());
    },

    // observe items change under the given node.
    _observeItems: function(node) {
      return Polymer.dom(node).observeNodes(function(mutation) {
        this._updateItems();

        if (this._shouldUpdateSelection) {
          this._updateSelected();
        }

        // Let other interested parties know about the change so that
        // we don't have to recreate mutation observers everywhere.
        this.fire('iron-items-changed', mutation, {
          bubbles: false,
          cancelable: false
        });
      });
    },

    _activateHandler: function(e) {
      var t = e.target;
      var items = this.items;
      while (t && t != this) {
        var i = items.indexOf(t);
        if (i >= 0) {
          var value = this._indexToValue(i);
          this._itemActivate(value, t);
          return;
        }
        t = t.parentNode;
      }
    },

    _itemActivate: function(value, item) {
      if (!this.fire('iron-activate',
          {selected: value, item: item}, {cancelable: true}).defaultPrevented) {
        this.select(value);
      }
    }

  };
Polymer({

      is: 'iron-pages',

      behaviors: [
        Polymer.IronResizableBehavior,
        Polymer.IronSelectableBehavior
      ],

      properties: {

        // as the selected page is the only one visible, activateEvent
        // is both non-sensical and problematic; e.g. in cases where a user
        // handler attempts to change the page and the activateEvent
        // handler immediately changes it back
        activateEvent: {
          type: String,
          value: null
        }

      },

      observers: [
        '_selectedPageChanged(selected)'
      ],

      _selectedPageChanged: function(selected, old) {
        this.async(this.notifyResize);
      }
    });
/** @polymerBehavior Polymer.IronMultiSelectableBehavior */
  Polymer.IronMultiSelectableBehaviorImpl = {
    properties: {

      /**
       * If true, multiple selections are allowed.
       */
      multi: {
        type: Boolean,
        value: false,
        observer: 'multiChanged'
      },

      /**
       * Gets or sets the selected elements. This is used instead of `selected` when `multi`
       * is true.
       */
      selectedValues: {
        type: Array,
        notify: true
      },

      /**
       * Returns an array of currently selected items.
       */
      selectedItems: {
        type: Array,
        readOnly: true,
        notify: true
      },

    },

    observers: [
      '_updateSelected(selectedValues.splices)'
    ],

    /**
     * Selects the given value. If the `multi` property is true, then the selected state of the
     * `value` will be toggled; otherwise the `value` will be selected.
     *
     * @method select
     * @param {string|number} value the value to select.
     */
    select: function(value) {
      if (this.multi) {
        if (this.selectedValues) {
          this._toggleSelected(value);
        } else {
          this.selectedValues = [value];
        }
      } else {
        this.selected = value;
      }
    },

    multiChanged: function(multi) {
      this._selection.multi = multi;
    },

    get _shouldUpdateSelection() {
      return this.selected != null ||
        (this.selectedValues != null && this.selectedValues.length);
    },

    _updateAttrForSelected: function() {
      if (!this.multi) {
        Polymer.IronSelectableBehavior._updateAttrForSelected.apply(this);
      } else if (this._shouldUpdateSelection) {
        this.selectedValues = this.selectedItems.map(function(selectedItem) {
          return this._indexToValue(this.indexOf(selectedItem));
        }, this).filter(function(unfilteredValue) {
          return unfilteredValue != null;
        }, this);
      }
    },

    _updateSelected: function() {
      if (this.multi) {
        this._selectMulti(this.selectedValues);
      } else {
        this._selectSelected(this.selected);
      }
    },

    _selectMulti: function(values) {
      if (values) {
        var selectedItems = this._valuesToItems(values);
        // clear all but the current selected items
        this._selection.clear(selectedItems);
        // select only those not selected yet
        for (var i = 0; i < selectedItems.length; i++) {
          this._selection.setItemSelected(selectedItems[i], true);
        }
        // Check for items, since this array is populated only when attached
        if (this.fallbackSelection && this.items.length && !this._selection.get().length) {
          var fallback = this._valueToItem(this.fallbackSelection);
          if (fallback) {
            this.selectedValues = [this.fallbackSelection];
          }
        }
      } else {
        this._selection.clear();
      }
    },

    _selectionChange: function() {
      var s = this._selection.get();
      if (this.multi) {
        this._setSelectedItems(s);
      } else {
        this._setSelectedItems([s]);
        this._setSelectedItem(s);
      }
    },

    _toggleSelected: function(value) {
      var i = this.selectedValues.indexOf(value);
      var unselected = i < 0;
      if (unselected) {
        this.push('selectedValues',value);
      } else {
        this.splice('selectedValues',i,1);
      }
    },

    _valuesToItems: function(values) {
      return (values == null) ? null : values.map(function(value) {
        return this._valueToItem(value);
      }, this);
    }
  };

  /** @polymerBehavior */
  Polymer.IronMultiSelectableBehavior = [
    Polymer.IronSelectableBehavior,
    Polymer.IronMultiSelectableBehaviorImpl
  ];
/**
  `iron-selector` is an element which can be used to manage a list of elements
  that can be selected.  Tapping on the item will make the item selected.  The `selected` indicates
  which item is being selected.  The default is to use the index of the item.

  Example:

      <iron-selector selected="0">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </iron-selector>

  If you want to use the attribute value of an element for `selected` instead of the index,
  set `attrForSelected` to the name of the attribute.  For example, if you want to select item by
  `name`, set `attrForSelected` to `name`.

  Example:

      <iron-selector attr-for-selected="name" selected="foo">
        <div name="foo">Foo</div>
        <div name="bar">Bar</div>
        <div name="zot">Zot</div>
      </iron-selector>

  You can specify a default fallback with `fallbackSelection` in case the `selected` attribute does
  not match the `attrForSelected` attribute of any elements.

  Example:

        <iron-selector attr-for-selected="name" selected="non-existing"
                       fallback-selection="default">
          <div name="foo">Foo</div>
          <div name="bar">Bar</div>
          <div name="default">Default</div>
        </iron-selector>

  Note: When the selector is multi, the selection will set to `fallbackSelection` iff
  the number of matching elements is zero.

  `iron-selector` is not styled. Use the `iron-selected` CSS class to style the selected element.

  Example:

      <style>
        .iron-selected {
          background: #eee;
        }
      </style>

      ...

      <iron-selector selected="0">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </iron-selector>

  @demo demo/index.html
  */

  Polymer({

    is: 'iron-selector',

    behaviors: [
      Polymer.IronMultiSelectableBehavior
    ]

  });
(function() {

    // monostate data
    var metaDatas = {};
    var metaArrays = {};
    var singleton = null;

    Polymer.IronMeta = Polymer({

      is: 'iron-meta',

      properties: {

        /**
         * The type of meta-data.  All meta-data of the same type is stored
         * together.
         */
        type: {
          type: String,
          value: 'default',
          observer: '_typeChanged'
        },

        /**
         * The key used to store `value` under the `type` namespace.
         */
        key: {
          type: String,
          observer: '_keyChanged'
        },

        /**
         * The meta-data to store or retrieve.
         */
        value: {
          type: Object,
          notify: true,
          observer: '_valueChanged'
        },

        /**
         * If true, `value` is set to the iron-meta instance itself.
         */
         self: {
          type: Boolean,
          observer: '_selfChanged'
        },

        /**
         * Array of all meta-data values for the given type.
         */
        list: {
          type: Array,
          notify: true
        }

      },

      hostAttributes: {
        hidden: true
      },

      /**
       * Only runs if someone invokes the factory/constructor directly
       * e.g. `new Polymer.IronMeta()`
       *
       * @param {{type: (string|undefined), key: (string|undefined), value}=} config
       */
      factoryImpl: function(config) {
        if (config) {
          for (var n in config) {
            switch(n) {
              case 'type':
              case 'key':
              case 'value':
                this[n] = config[n];
                break;
            }
          }
        }
      },

      created: function() {
        // TODO(sjmiles): good for debugging?
        this._metaDatas = metaDatas;
        this._metaArrays = metaArrays;
      },

      _keyChanged: function(key, old) {
        this._resetRegistration(old);
      },

      _valueChanged: function(value) {
        this._resetRegistration(this.key);
      },

      _selfChanged: function(self) {
        if (self) {
          this.value = this;
        }
      },

      _typeChanged: function(type) {
        this._unregisterKey(this.key);
        if (!metaDatas[type]) {
          metaDatas[type] = {};
        }
        this._metaData = metaDatas[type];
        if (!metaArrays[type]) {
          metaArrays[type] = [];
        }
        this.list = metaArrays[type];
        this._registerKeyValue(this.key, this.value);
      },

      /**
       * Retrieves meta data value by key.
       *
       * @method byKey
       * @param {string} key The key of the meta-data to be returned.
       * @return {*}
       */
      byKey: function(key) {
        return this._metaData && this._metaData[key];
      },

      _resetRegistration: function(oldKey) {
        this._unregisterKey(oldKey);
        this._registerKeyValue(this.key, this.value);
      },

      _unregisterKey: function(key) {
        this._unregister(key, this._metaData, this.list);
      },

      _registerKeyValue: function(key, value) {
        this._register(key, value, this._metaData, this.list);
      },

      _register: function(key, value, data, list) {
        if (key && data && value !== undefined) {
          data[key] = value;
          list.push(value);
        }
      },

      _unregister: function(key, data, list) {
        if (key && data) {
          if (key in data) {
            var value = data[key];
            delete data[key];
            this.arrayDelete(list, value);
          }
        }
      }

    });

    Polymer.IronMeta.getIronMeta = function getIronMeta() {
       if (singleton === null) {
         singleton = new Polymer.IronMeta();
       }
       return singleton;
     };

    /**
    `iron-meta-query` can be used to access infomation stored in `iron-meta`.

    Examples:

    If I create an instance like this:

        <iron-meta key="info" value="foo/bar"></iron-meta>

    Note that value="foo/bar" is the metadata I've defined. I could define more
    attributes or use child nodes to define additional metadata.

    Now I can access that element (and it's metadata) from any `iron-meta-query` instance:

         var value = new Polymer.IronMetaQuery({key: 'info'}).value;

    @group Polymer Iron Elements
    @element iron-meta-query
    */
    Polymer.IronMetaQuery = Polymer({

      is: 'iron-meta-query',

      properties: {

        /**
         * The type of meta-data.  All meta-data of the same type is stored
         * together.
         */
        type: {
          type: String,
          value: 'default',
          observer: '_typeChanged'
        },

        /**
         * Specifies a key to use for retrieving `value` from the `type`
         * namespace.
         */
        key: {
          type: String,
          observer: '_keyChanged'
        },

        /**
         * The meta-data to store or retrieve.
         */
        value: {
          type: Object,
          notify: true,
          readOnly: true
        },

        /**
         * Array of all meta-data values for the given type.
         */
        list: {
          type: Array,
          notify: true
        }

      },

      /**
       * Actually a factory method, not a true constructor. Only runs if
       * someone invokes it directly (via `new Polymer.IronMeta()`);
       *
       * @param {{type: (string|undefined), key: (string|undefined)}=} config
       */
      factoryImpl: function(config) {
        if (config) {
          for (var n in config) {
            switch(n) {
              case 'type':
              case 'key':
                this[n] = config[n];
                break;
            }
          }
        }
      },

      created: function() {
        // TODO(sjmiles): good for debugging?
        this._metaDatas = metaDatas;
        this._metaArrays = metaArrays;
      },

      _keyChanged: function(key) {
        this._setValue(this._metaData && this._metaData[key]);
      },

      _typeChanged: function(type) {
        this._metaData = metaDatas[type];
        this.list = metaArrays[type];
        if (this.key) {
          this._keyChanged(this.key);
        }
      },

      /**
       * Retrieves meta data value by key.
       * @param {string} key The key of the meta-data to be returned.
       * @return {*}
       */
      byKey: function(key) {
        return this._metaData && this._metaData[key];
      }

    });

  })();
Polymer({

      is: 'iron-icon',

      properties: {

        /**
         * The name of the icon to use. The name should be of the form:
         * `iconset_name:icon_name`.
         */
        icon: {
          type: String
        },

        /**
         * The name of the theme to used, if one is specified by the
         * iconset.
         */
        theme: {
          type: String
        },

        /**
         * If using iron-icon without an iconset, you can set the src to be
         * the URL of an individual icon image file. Note that this will take
         * precedence over a given icon attribute.
         */
        src: {
          type: String
        },

        /**
         * @type {!Polymer.IronMeta}
         */
        _meta: {
          value: Polymer.Base.create('iron-meta', {type: 'iconset'})
        }

      },

      observers: [
        '_updateIcon(_meta, isAttached)',
        '_updateIcon(theme, isAttached)',
        '_srcChanged(src, isAttached)',
        '_iconChanged(icon, isAttached)'
      ],

      _DEFAULT_ICONSET: 'icons',

      _iconChanged: function(icon) {
        var parts = (icon || '').split(':');
        this._iconName = parts.pop();
        this._iconsetName = parts.pop() || this._DEFAULT_ICONSET;
        this._updateIcon();
      },

      _srcChanged: function(src) {
        this._updateIcon();
      },

      _usesIconset: function() {
        return this.icon || !this.src;
      },

      /** @suppress {visibility} */
      _updateIcon: function() {
        if (this._usesIconset()) {
          if (this._img && this._img.parentNode) {
            Polymer.dom(this.root).removeChild(this._img);
          }
          if (this._iconName === "") {
            if (this._iconset) {
              this._iconset.removeIcon(this);
            }
          } else if (this._iconsetName && this._meta) {
            this._iconset = /** @type {?Polymer.Iconset} */ (
              this._meta.byKey(this._iconsetName));
            if (this._iconset) {
              this._iconset.applyIcon(this, this._iconName, this.theme);
              this.unlisten(window, 'iron-iconset-added', '_updateIcon');
            } else {
              this.listen(window, 'iron-iconset-added', '_updateIcon');
            }
          }
        } else {
          if (this._iconset) {
            this._iconset.removeIcon(this);
          }
          if (!this._img) {
            this._img = document.createElement('img');
            this._img.style.width = '100%';
            this._img.style.height = '100%';
            this._img.draggable = false;
          }
          this._img.src = this.src;
          Polymer.dom(this.root).appendChild(this._img);
        }
      }

    });
(function() {
    'use strict';

    /**
     * Chrome uses an older version of DOM Level 3 Keyboard Events
     *
     * Most keys are labeled as text, but some are Unicode codepoints.
     * Values taken from: http://www.w3.org/TR/2007/WD-DOM-Level-3-Events-20071221/keyset.html#KeySet-Set
     */
    var KEY_IDENTIFIER = {
      'U+0008': 'backspace',
      'U+0009': 'tab',
      'U+001B': 'esc',
      'U+0020': 'space',
      'U+007F': 'del'
    };

    /**
     * Special table for KeyboardEvent.keyCode.
     * KeyboardEvent.keyIdentifier is better, and KeyBoardEvent.key is even better
     * than that.
     *
     * Values from: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent.keyCode#Value_of_keyCode
     */
    var KEY_CODE = {
      8: 'backspace',
      9: 'tab',
      13: 'enter',
      27: 'esc',
      33: 'pageup',
      34: 'pagedown',
      35: 'end',
      36: 'home',
      32: 'space',
      37: 'left',
      38: 'up',
      39: 'right',
      40: 'down',
      46: 'del',
      106: '*'
    };

    /**
     * MODIFIER_KEYS maps the short name for modifier keys used in a key
     * combo string to the property name that references those same keys
     * in a KeyboardEvent instance.
     */
    var MODIFIER_KEYS = {
      'shift': 'shiftKey',
      'ctrl': 'ctrlKey',
      'alt': 'altKey',
      'meta': 'metaKey'
    };

    /**
     * KeyboardEvent.key is mostly represented by printable character made by
     * the keyboard, with unprintable keys labeled nicely.
     *
     * However, on OS X, Alt+char can make a Unicode character that follows an
     * Apple-specific mapping. In this case, we fall back to .keyCode.
     */
    var KEY_CHAR = /[a-z0-9*]/;

    /**
     * Matches a keyIdentifier string.
     */
    var IDENT_CHAR = /U\+/;

    /**
     * Matches arrow keys in Gecko 27.0+
     */
    var ARROW_KEY = /^arrow/;

    /**
     * Matches space keys everywhere (notably including IE10's exceptional name
     * `spacebar`).
     */
    var SPACE_KEY = /^space(bar)?/;

    /**
     * Matches ESC key.
     *
     * Value from: http://w3c.github.io/uievents-key/#key-Escape
     */
    var ESC_KEY = /^escape$/;

    /**
     * Transforms the key.
     * @param {string} key The KeyBoardEvent.key
     * @param {Boolean} [noSpecialChars] Limits the transformation to
     * alpha-numeric characters.
     */
    function transformKey(key, noSpecialChars) {
      var validKey = '';
      if (key) {
        var lKey = key.toLowerCase();
        if (lKey === ' ' || SPACE_KEY.test(lKey)) {
          validKey = 'space';
        } else if (ESC_KEY.test(lKey)) {
          validKey = 'esc';
        } else if (lKey.length == 1) {
          if (!noSpecialChars || KEY_CHAR.test(lKey)) {
            validKey = lKey;
          }
        } else if (ARROW_KEY.test(lKey)) {
          validKey = lKey.replace('arrow', '');
        } else if (lKey == 'multiply') {
          // numpad '*' can map to Multiply on IE/Windows
          validKey = '*';
        } else {
          validKey = lKey;
        }
      }
      return validKey;
    }

    function transformKeyIdentifier(keyIdent) {
      var validKey = '';
      if (keyIdent) {
        if (keyIdent in KEY_IDENTIFIER) {
          validKey = KEY_IDENTIFIER[keyIdent];
        } else if (IDENT_CHAR.test(keyIdent)) {
          keyIdent = parseInt(keyIdent.replace('U+', '0x'), 16);
          validKey = String.fromCharCode(keyIdent).toLowerCase();
        } else {
          validKey = keyIdent.toLowerCase();
        }
      }
      return validKey;
    }

    function transformKeyCode(keyCode) {
      var validKey = '';
      if (Number(keyCode)) {
        if (keyCode >= 65 && keyCode <= 90) {
          // ascii a-z
          // lowercase is 32 offset from uppercase
          validKey = String.fromCharCode(32 + keyCode);
        } else if (keyCode >= 112 && keyCode <= 123) {
          // function keys f1-f12
          validKey = 'f' + (keyCode - 112);
        } else if (keyCode >= 48 && keyCode <= 57) {
          // top 0-9 keys
          validKey = String(keyCode - 48);
        } else if (keyCode >= 96 && keyCode <= 105) {
          // num pad 0-9
          validKey = String(keyCode - 96);
        } else {
          validKey = KEY_CODE[keyCode];
        }
      }
      return validKey;
    }

    /**
      * Calculates the normalized key for a KeyboardEvent.
      * @param {KeyboardEvent} keyEvent
      * @param {Boolean} [noSpecialChars] Set to true to limit keyEvent.key
      * transformation to alpha-numeric chars. This is useful with key
      * combinations like shift + 2, which on FF for MacOS produces
      * keyEvent.key = @
      * To get 2 returned, set noSpecialChars = true
      * To get @ returned, set noSpecialChars = false
     */
    function normalizedKeyForEvent(keyEvent, noSpecialChars) {
      // Fall back from .key, to .detail.key for artifical keyboard events,
      // and then to deprecated .keyIdentifier and .keyCode.
      if (keyEvent.key) {
        return transformKey(keyEvent.key, noSpecialChars);
      }
      if (keyEvent.detail && keyEvent.detail.key) {
        return transformKey(keyEvent.detail.key, noSpecialChars);
      }
      return transformKeyIdentifier(keyEvent.keyIdentifier) ||
        transformKeyCode(keyEvent.keyCode) || '';
    }

    function keyComboMatchesEvent(keyCombo, event) {
      // For combos with modifiers we support only alpha-numeric keys
      var keyEvent = normalizedKeyForEvent(event, keyCombo.hasModifiers);
      return keyEvent === keyCombo.key &&
        (!keyCombo.hasModifiers || (
          !!event.shiftKey === !!keyCombo.shiftKey &&
          !!event.ctrlKey === !!keyCombo.ctrlKey &&
          !!event.altKey === !!keyCombo.altKey &&
          !!event.metaKey === !!keyCombo.metaKey)
        );
    }

    function parseKeyComboString(keyComboString) {
      if (keyComboString.length === 1) {
        return {
          combo: keyComboString,
          key: keyComboString,
          event: 'keydown'
        };
      }
      return keyComboString.split('+').reduce(function(parsedKeyCombo, keyComboPart) {
        var eventParts = keyComboPart.split(':');
        var keyName = eventParts[0];
        var event = eventParts[1];

        if (keyName in MODIFIER_KEYS) {
          parsedKeyCombo[MODIFIER_KEYS[keyName]] = true;
          parsedKeyCombo.hasModifiers = true;
        } else {
          parsedKeyCombo.key = keyName;
          parsedKeyCombo.event = event || 'keydown';
        }

        return parsedKeyCombo;
      }, {
        combo: keyComboString.split(':').shift()
      });
    }

    function parseEventString(eventString) {
      return eventString.trim().split(' ').map(function(keyComboString) {
        return parseKeyComboString(keyComboString);
      });
    }

    /**
     * `Polymer.IronA11yKeysBehavior` provides a normalized interface for processing
     * keyboard commands that pertain to [WAI-ARIA best practices](http://www.w3.org/TR/wai-aria-practices/#kbd_general_binding).
     * The element takes care of browser differences with respect to Keyboard events
     * and uses an expressive syntax to filter key presses.
     *
     * Use the `keyBindings` prototype property to express what combination of keys
     * will trigger the callback. A key binding has the format
     * `"KEY+MODIFIER:EVENT": "callback"` (`"KEY": "callback"` or
     * `"KEY:EVENT": "callback"` are valid as well). Some examples:
     *
     *      keyBindings: {
     *        'space': '_onKeydown', // same as 'space:keydown'
     *        'shift+tab': '_onKeydown',
     *        'enter:keypress': '_onKeypress',
     *        'esc:keyup': '_onKeyup'
     *      }
     *
     * The callback will receive with an event containing the following information in `event.detail`:
     *
     *      _onKeydown: function(event) {
     *        console.log(event.detail.combo); // KEY+MODIFIER, e.g. "shift+tab"
     *        console.log(event.detail.key); // KEY only, e.g. "tab"
     *        console.log(event.detail.event); // EVENT, e.g. "keydown"
     *        console.log(event.detail.keyboardEvent); // the original KeyboardEvent
     *      }
     *
     * Use the `keyEventTarget` attribute to set up event handlers on a specific
     * node.
     *
     * See the [demo source code](https://github.com/PolymerElements/iron-a11y-keys-behavior/blob/master/demo/x-key-aware.html)
     * for an example.
     *
     * @demo demo/index.html
     * @polymerBehavior
     */
    Polymer.IronA11yKeysBehavior = {
      properties: {
        /**
         * The EventTarget that will be firing relevant KeyboardEvents. Set it to
         * `null` to disable the listeners.
         * @type {?EventTarget}
         */
        keyEventTarget: {
          type: Object,
          value: function() {
            return this;
          }
        },

        /**
         * If true, this property will cause the implementing element to
         * automatically stop propagation on any handled KeyboardEvents.
         */
        stopKeyboardEventPropagation: {
          type: Boolean,
          value: false
        },

        _boundKeyHandlers: {
          type: Array,
          value: function() {
            return [];
          }
        },

        // We use this due to a limitation in IE10 where instances will have
        // own properties of everything on the "prototype".
        _imperativeKeyBindings: {
          type: Object,
          value: function() {
            return {};
          }
        }
      },

      observers: [
        '_resetKeyEventListeners(keyEventTarget, _boundKeyHandlers)'
      ],


      /**
       * To be used to express what combination of keys  will trigger the relative
       * callback. e.g. `keyBindings: { 'esc': '_onEscPressed'}`
       * @type {!Object}
       */
      keyBindings: {},

      registered: function() {
        this._prepKeyBindings();
      },

      attached: function() {
        this._listenKeyEventListeners();
      },

      detached: function() {
        this._unlistenKeyEventListeners();
      },

      /**
       * Can be used to imperatively add a key binding to the implementing
       * element. This is the imperative equivalent of declaring a keybinding
       * in the `keyBindings` prototype property.
       */
      addOwnKeyBinding: function(eventString, handlerName) {
        this._imperativeKeyBindings[eventString] = handlerName;
        this._prepKeyBindings();
        this._resetKeyEventListeners();
      },

      /**
       * When called, will remove all imperatively-added key bindings.
       */
      removeOwnKeyBindings: function() {
        this._imperativeKeyBindings = {};
        this._prepKeyBindings();
        this._resetKeyEventListeners();
      },

      /**
       * Returns true if a keyboard event matches `eventString`.
       *
       * @param {KeyboardEvent} event
       * @param {string} eventString
       * @return {boolean}
       */
      keyboardEventMatchesKeys: function(event, eventString) {
        var keyCombos = parseEventString(eventString);
        for (var i = 0; i < keyCombos.length; ++i) {
          if (keyComboMatchesEvent(keyCombos[i], event)) {
            return true;
          }
        }
        return false;
      },

      _collectKeyBindings: function() {
        var keyBindings = this.behaviors.map(function(behavior) {
          return behavior.keyBindings;
        });

        if (keyBindings.indexOf(this.keyBindings) === -1) {
          keyBindings.push(this.keyBindings);
        }

        return keyBindings;
      },

      _prepKeyBindings: function() {
        this._keyBindings = {};

        this._collectKeyBindings().forEach(function(keyBindings) {
          for (var eventString in keyBindings) {
            this._addKeyBinding(eventString, keyBindings[eventString]);
          }
        }, this);

        for (var eventString in this._imperativeKeyBindings) {
          this._addKeyBinding(eventString, this._imperativeKeyBindings[eventString]);
        }

        // Give precedence to combos with modifiers to be checked first.
        for (var eventName in this._keyBindings) {
          this._keyBindings[eventName].sort(function (kb1, kb2) {
            var b1 = kb1[0].hasModifiers;
            var b2 = kb2[0].hasModifiers;
            return (b1 === b2) ? 0 : b1 ? -1 : 1;
          })
        }
      },

      _addKeyBinding: function(eventString, handlerName) {
        parseEventString(eventString).forEach(function(keyCombo) {
          this._keyBindings[keyCombo.event] =
            this._keyBindings[keyCombo.event] || [];

          this._keyBindings[keyCombo.event].push([
            keyCombo,
            handlerName
          ]);
        }, this);
      },

      _resetKeyEventListeners: function() {
        this._unlistenKeyEventListeners();

        if (this.isAttached) {
          this._listenKeyEventListeners();
        }
      },

      _listenKeyEventListeners: function() {
        if (!this.keyEventTarget) {
          return;
        }
        Object.keys(this._keyBindings).forEach(function(eventName) {
          var keyBindings = this._keyBindings[eventName];
          var boundKeyHandler = this._onKeyBindingEvent.bind(this, keyBindings);

          this._boundKeyHandlers.push([this.keyEventTarget, eventName, boundKeyHandler]);

          this.keyEventTarget.addEventListener(eventName, boundKeyHandler);
        }, this);
      },

      _unlistenKeyEventListeners: function() {
        var keyHandlerTuple;
        var keyEventTarget;
        var eventName;
        var boundKeyHandler;

        while (this._boundKeyHandlers.length) {
          // My kingdom for block-scope binding and destructuring assignment..
          keyHandlerTuple = this._boundKeyHandlers.pop();
          keyEventTarget = keyHandlerTuple[0];
          eventName = keyHandlerTuple[1];
          boundKeyHandler = keyHandlerTuple[2];

          keyEventTarget.removeEventListener(eventName, boundKeyHandler);
        }
      },

      _onKeyBindingEvent: function(keyBindings, event) {
        if (this.stopKeyboardEventPropagation) {
          event.stopPropagation();
        }

        // if event has been already prevented, don't do anything
        if (event.defaultPrevented) {
          return;
        }

        for (var i = 0; i < keyBindings.length; i++) {
          var keyCombo = keyBindings[i][0];
          var handlerName = keyBindings[i][1];
          if (keyComboMatchesEvent(keyCombo, event)) {
            this._triggerKeyHandler(keyCombo, handlerName, event);
            // exit the loop if eventDefault was prevented
            if (event.defaultPrevented) {
              return;
            }
          }
        }
      },

      _triggerKeyHandler: function(keyCombo, handlerName, keyboardEvent) {
        var detail = Object.create(keyCombo);
        detail.keyboardEvent = keyboardEvent;
        var event = new CustomEvent(keyCombo.event, {
          detail: detail,
          cancelable: true
        });
        this[handlerName].call(this, event);
        if (event.defaultPrevented) {
          keyboardEvent.preventDefault();
        }
      }
    };
  })();
/**
   * @demo demo/index.html
   * @polymerBehavior
   */
  Polymer.IronControlState = {

    properties: {

      /**
       * If true, the element currently has focus.
       */
      focused: {
        type: Boolean,
        value: false,
        notify: true,
        readOnly: true,
        reflectToAttribute: true
      },

      /**
       * If true, the user cannot interact with this element.
       */
      disabled: {
        type: Boolean,
        value: false,
        notify: true,
        observer: '_disabledChanged',
        reflectToAttribute: true
      },

      _oldTabIndex: {
        type: Number
      },

      _boundFocusBlurHandler: {
        type: Function,
        value: function() {
          return this._focusBlurHandler.bind(this);
        }
      }

    },

    observers: [
      '_changedControlState(focused, disabled)'
    ],

    ready: function() {
      this.addEventListener('focus', this._boundFocusBlurHandler, true);
      this.addEventListener('blur', this._boundFocusBlurHandler, true);
    },

    _focusBlurHandler: function(event) {
      // NOTE(cdata):  if we are in ShadowDOM land, `event.target` will
      // eventually become `this` due to retargeting; if we are not in
      // ShadowDOM land, `event.target` will eventually become `this` due
      // to the second conditional which fires a synthetic event (that is also
      // handled). In either case, we can disregard `event.path`.

      if (event.target === this) {
        this._setFocused(event.type === 'focus');
      } else if (!this.shadowRoot) {
        var target = /** @type {Node} */(Polymer.dom(event).localTarget);
        if (!this.isLightDescendant(target)) {
          this.fire(event.type, {sourceEvent: event}, {
            node: this,
            bubbles: event.bubbles,
            cancelable: event.cancelable
          });
        }
      }
    },

    _disabledChanged: function(disabled, old) {
      this.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      this.style.pointerEvents = disabled ? 'none' : '';
      if (disabled) {
        this._oldTabIndex = this.tabIndex;
        this._setFocused(false);
        this.tabIndex = -1;
        this.blur();
      } else if (this._oldTabIndex !== undefined) {
        this.tabIndex = this._oldTabIndex;
      }
    },

    _changedControlState: function() {
      // _controlStateChanged is abstract, follow-on behaviors may implement it
      if (this._controlStateChanged) {
        this._controlStateChanged();
      }
    }

  };
/**
   * @demo demo/index.html
   * @polymerBehavior Polymer.IronButtonState
   */
  Polymer.IronButtonStateImpl = {

    properties: {

      /**
       * If true, the user is currently holding down the button.
       */
      pressed: {
        type: Boolean,
        readOnly: true,
        value: false,
        reflectToAttribute: true,
        observer: '_pressedChanged'
      },

      /**
       * If true, the button toggles the active state with each tap or press
       * of the spacebar.
       */
      toggles: {
        type: Boolean,
        value: false,
        reflectToAttribute: true
      },

      /**
       * If true, the button is a toggle and is currently in the active state.
       */
      active: {
        type: Boolean,
        value: false,
        notify: true,
        reflectToAttribute: true
      },

      /**
       * True if the element is currently being pressed by a "pointer," which
       * is loosely defined as mouse or touch input (but specifically excluding
       * keyboard input).
       */
      pointerDown: {
        type: Boolean,
        readOnly: true,
        value: false
      },

      /**
       * True if the input device that caused the element to receive focus
       * was a keyboard.
       */
      receivedFocusFromKeyboard: {
        type: Boolean,
        readOnly: true
      },

      /**
       * The aria attribute to be set if the button is a toggle and in the
       * active state.
       */
      ariaActiveAttribute: {
        type: String,
        value: 'aria-pressed',
        observer: '_ariaActiveAttributeChanged'
      }
    },

    listeners: {
      down: '_downHandler',
      up: '_upHandler',
      tap: '_tapHandler'
    },

    observers: [
      '_detectKeyboardFocus(focused)',
      '_activeChanged(active, ariaActiveAttribute)'
    ],

    keyBindings: {
      'enter:keydown': '_asyncClick',
      'space:keydown': '_spaceKeyDownHandler',
      'space:keyup': '_spaceKeyUpHandler',
    },

    _mouseEventRe: /^mouse/,

    _tapHandler: function() {
      if (this.toggles) {
       // a tap is needed to toggle the active state
        this._userActivate(!this.active);
      } else {
        this.active = false;
      }
    },

    _detectKeyboardFocus: function(focused) {
      this._setReceivedFocusFromKeyboard(!this.pointerDown && focused);
    },

    // to emulate native checkbox, (de-)activations from a user interaction fire
    // 'change' events
    _userActivate: function(active) {
      if (this.active !== active) {
        this.active = active;
        this.fire('change');
      }
    },

    _downHandler: function(event) {
      this._setPointerDown(true);
      this._setPressed(true);
      this._setReceivedFocusFromKeyboard(false);
    },

    _upHandler: function() {
      this._setPointerDown(false);
      this._setPressed(false);
    },

    /**
     * @param {!KeyboardEvent} event .
     */
    _spaceKeyDownHandler: function(event) {
      var keyboardEvent = event.detail.keyboardEvent;
      var target = Polymer.dom(keyboardEvent).localTarget;

      // Ignore the event if this is coming from a focused light child, since that
      // element will deal with it.
      if (this.isLightDescendant(/** @type {Node} */(target)))
        return;

      keyboardEvent.preventDefault();
      keyboardEvent.stopImmediatePropagation();
      this._setPressed(true);
    },

    /**
     * @param {!KeyboardEvent} event .
     */
    _spaceKeyUpHandler: function(event) {
      var keyboardEvent = event.detail.keyboardEvent;
      var target = Polymer.dom(keyboardEvent).localTarget;

      // Ignore the event if this is coming from a focused light child, since that
      // element will deal with it.
      if (this.isLightDescendant(/** @type {Node} */(target)))
        return;

      if (this.pressed) {
        this._asyncClick();
      }
      this._setPressed(false);
    },

    // trigger click asynchronously, the asynchrony is useful to allow one
    // event handler to unwind before triggering another event
    _asyncClick: function() {
      this.async(function() {
        this.click();
      }, 1);
    },

    // any of these changes are considered a change to button state

    _pressedChanged: function(pressed) {
      this._changedButtonState();
    },

    _ariaActiveAttributeChanged: function(value, oldValue) {
      if (oldValue && oldValue != value && this.hasAttribute(oldValue)) {
        this.removeAttribute(oldValue);
      }
    },

    _activeChanged: function(active, ariaActiveAttribute) {
      if (this.toggles) {
        this.setAttribute(this.ariaActiveAttribute,
                          active ? 'true' : 'false');
      } else {
        this.removeAttribute(this.ariaActiveAttribute);
      }
      this._changedButtonState();
    },

    _controlStateChanged: function() {
      if (this.disabled) {
        this._setPressed(false);
      } else {
        this._changedButtonState();
      }
    },

    // provide hook for follow-on behaviors to react to button-state

    _changedButtonState: function() {
      if (this._buttonStateChanged) {
        this._buttonStateChanged(); // abstract
      }
    }

  };

  /** @polymerBehavior */
  Polymer.IronButtonState = [
    Polymer.IronA11yKeysBehavior,
    Polymer.IronButtonStateImpl
  ];
(function() {
    var Utility = {
      distance: function(x1, y1, x2, y2) {
        var xDelta = (x1 - x2);
        var yDelta = (y1 - y2);

        return Math.sqrt(xDelta * xDelta + yDelta * yDelta);
      },

      now: window.performance && window.performance.now ?
          window.performance.now.bind(window.performance) : Date.now
    };

    /**
     * @param {HTMLElement} element
     * @constructor
     */
    function ElementMetrics(element) {
      this.element = element;
      this.width = this.boundingRect.width;
      this.height = this.boundingRect.height;

      this.size = Math.max(this.width, this.height);
    }

    ElementMetrics.prototype = {
      get boundingRect () {
        return this.element.getBoundingClientRect();
      },

      furthestCornerDistanceFrom: function(x, y) {
        var topLeft = Utility.distance(x, y, 0, 0);
        var topRight = Utility.distance(x, y, this.width, 0);
        var bottomLeft = Utility.distance(x, y, 0, this.height);
        var bottomRight = Utility.distance(x, y, this.width, this.height);

        return Math.max(topLeft, topRight, bottomLeft, bottomRight);
      }
    };

    /**
     * @param {HTMLElement} element
     * @constructor
     */
    function Ripple(element) {
      this.element = element;
      this.color = window.getComputedStyle(element).color;

      this.wave = document.createElement('div');
      this.waveContainer = document.createElement('div');
      this.wave.style.backgroundColor = this.color;
      this.wave.classList.add('wave');
      this.waveContainer.classList.add('wave-container');
      Polymer.dom(this.waveContainer).appendChild(this.wave);

      this.resetInteractionState();
    }

    Ripple.MAX_RADIUS = 300;

    Ripple.prototype = {
      get recenters() {
        return this.element.recenters;
      },

      get center() {
        return this.element.center;
      },

      get mouseDownElapsed() {
        var elapsed;

        if (!this.mouseDownStart) {
          return 0;
        }

        elapsed = Utility.now() - this.mouseDownStart;

        if (this.mouseUpStart) {
          elapsed -= this.mouseUpElapsed;
        }

        return elapsed;
      },

      get mouseUpElapsed() {
        return this.mouseUpStart ?
          Utility.now () - this.mouseUpStart : 0;
      },

      get mouseDownElapsedSeconds() {
        return this.mouseDownElapsed / 1000;
      },

      get mouseUpElapsedSeconds() {
        return this.mouseUpElapsed / 1000;
      },

      get mouseInteractionSeconds() {
        return this.mouseDownElapsedSeconds + this.mouseUpElapsedSeconds;
      },

      get initialOpacity() {
        return this.element.initialOpacity;
      },

      get opacityDecayVelocity() {
        return this.element.opacityDecayVelocity;
      },

      get radius() {
        var width2 = this.containerMetrics.width * this.containerMetrics.width;
        var height2 = this.containerMetrics.height * this.containerMetrics.height;
        var waveRadius = Math.min(
          Math.sqrt(width2 + height2),
          Ripple.MAX_RADIUS
        ) * 1.1 + 5;

        var duration = 1.1 - 0.2 * (waveRadius / Ripple.MAX_RADIUS);
        var timeNow = this.mouseInteractionSeconds / duration;
        var size = waveRadius * (1 - Math.pow(80, -timeNow));

        return Math.abs(size);
      },

      get opacity() {
        if (!this.mouseUpStart) {
          return this.initialOpacity;
        }

        return Math.max(
          0,
          this.initialOpacity - this.mouseUpElapsedSeconds * this.opacityDecayVelocity
        );
      },

      get outerOpacity() {
        // Linear increase in background opacity, capped at the opacity
        // of the wavefront (waveOpacity).
        var outerOpacity = this.mouseUpElapsedSeconds * 0.3;
        var waveOpacity = this.opacity;

        return Math.max(
          0,
          Math.min(outerOpacity, waveOpacity)
        );
      },

      get isOpacityFullyDecayed() {
        return this.opacity < 0.01 &&
          this.radius >= Math.min(this.maxRadius, Ripple.MAX_RADIUS);
      },

      get isRestingAtMaxRadius() {
        return this.opacity >= this.initialOpacity &&
          this.radius >= Math.min(this.maxRadius, Ripple.MAX_RADIUS);
      },

      get isAnimationComplete() {
        return this.mouseUpStart ?
          this.isOpacityFullyDecayed : this.isRestingAtMaxRadius;
      },

      get translationFraction() {
        return Math.min(
          1,
          this.radius / this.containerMetrics.size * 2 / Math.sqrt(2)
        );
      },

      get xNow() {
        if (this.xEnd) {
          return this.xStart + this.translationFraction * (this.xEnd - this.xStart);
        }

        return this.xStart;
      },

      get yNow() {
        if (this.yEnd) {
          return this.yStart + this.translationFraction * (this.yEnd - this.yStart);
        }

        return this.yStart;
      },

      get isMouseDown() {
        return this.mouseDownStart && !this.mouseUpStart;
      },

      resetInteractionState: function() {
        this.maxRadius = 0;
        this.mouseDownStart = 0;
        this.mouseUpStart = 0;

        this.xStart = 0;
        this.yStart = 0;
        this.xEnd = 0;
        this.yEnd = 0;
        this.slideDistance = 0;

        this.containerMetrics = new ElementMetrics(this.element);
      },

      draw: function() {
        var scale;
        var translateString;
        var dx;
        var dy;

        this.wave.style.opacity = this.opacity;

        scale = this.radius / (this.containerMetrics.size / 2);
        dx = this.xNow - (this.containerMetrics.width / 2);
        dy = this.yNow - (this.containerMetrics.height / 2);


        // 2d transform for safari because of border-radius and overflow:hidden clipping bug.
        // https://bugs.webkit.org/show_bug.cgi?id=98538
        this.waveContainer.style.webkitTransform = 'translate(' + dx + 'px, ' + dy + 'px)';
        this.waveContainer.style.transform = 'translate3d(' + dx + 'px, ' + dy + 'px, 0)';
        this.wave.style.webkitTransform = 'scale(' + scale + ',' + scale + ')';
        this.wave.style.transform = 'scale3d(' + scale + ',' + scale + ',1)';
      },

      /** @param {Event=} event */
      downAction: function(event) {
        var xCenter = this.containerMetrics.width / 2;
        var yCenter = this.containerMetrics.height / 2;

        this.resetInteractionState();
        this.mouseDownStart = Utility.now();

        if (this.center) {
          this.xStart = xCenter;
          this.yStart = yCenter;
          this.slideDistance = Utility.distance(
            this.xStart, this.yStart, this.xEnd, this.yEnd
          );
        } else {
          this.xStart = event ?
              event.detail.x - this.containerMetrics.boundingRect.left :
              this.containerMetrics.width / 2;
          this.yStart = event ?
              event.detail.y - this.containerMetrics.boundingRect.top :
              this.containerMetrics.height / 2;
        }

        if (this.recenters) {
          this.xEnd = xCenter;
          this.yEnd = yCenter;
          this.slideDistance = Utility.distance(
            this.xStart, this.yStart, this.xEnd, this.yEnd
          );
        }

        this.maxRadius = this.containerMetrics.furthestCornerDistanceFrom(
          this.xStart,
          this.yStart
        );

        this.waveContainer.style.top =
          (this.containerMetrics.height - this.containerMetrics.size) / 2 + 'px';
        this.waveContainer.style.left =
          (this.containerMetrics.width - this.containerMetrics.size) / 2 + 'px';

        this.waveContainer.style.width = this.containerMetrics.size + 'px';
        this.waveContainer.style.height = this.containerMetrics.size + 'px';
      },

      /** @param {Event=} event */
      upAction: function(event) {
        if (!this.isMouseDown) {
          return;
        }

        this.mouseUpStart = Utility.now();
      },

      remove: function() {
        Polymer.dom(this.waveContainer.parentNode).removeChild(
          this.waveContainer
        );
      }
    };

    Polymer({
      is: 'paper-ripple',

      behaviors: [
        Polymer.IronA11yKeysBehavior
      ],

      properties: {
        /**
         * The initial opacity set on the wave.
         *
         * @attribute initialOpacity
         * @type number
         * @default 0.25
         */
        initialOpacity: {
          type: Number,
          value: 0.25
        },

        /**
         * How fast (opacity per second) the wave fades out.
         *
         * @attribute opacityDecayVelocity
         * @type number
         * @default 0.8
         */
        opacityDecayVelocity: {
          type: Number,
          value: 0.8
        },

        /**
         * If true, ripples will exhibit a gravitational pull towards
         * the center of their container as they fade away.
         *
         * @attribute recenters
         * @type boolean
         * @default false
         */
        recenters: {
          type: Boolean,
          value: false
        },

        /**
         * If true, ripples will center inside its container
         *
         * @attribute recenters
         * @type boolean
         * @default false
         */
        center: {
          type: Boolean,
          value: false
        },

        /**
         * A list of the visual ripples.
         *
         * @attribute ripples
         * @type Array
         * @default []
         */
        ripples: {
          type: Array,
          value: function() {
            return [];
          }
        },

        /**
         * True when there are visible ripples animating within the
         * element.
         */
        animating: {
          type: Boolean,
          readOnly: true,
          reflectToAttribute: true,
          value: false
        },

        /**
         * If true, the ripple will remain in the "down" state until `holdDown`
         * is set to false again.
         */
        holdDown: {
          type: Boolean,
          value: false,
          observer: '_holdDownChanged'
        },

        /**
         * If true, the ripple will not generate a ripple effect
         * via pointer interaction.
         * Calling ripple's imperative api like `simulatedRipple` will
         * still generate the ripple effect.
         */
        noink: {
          type: Boolean,
          value: false
        },

        _animating: {
          type: Boolean
        },

        _boundAnimate: {
          type: Function,
          value: function() {
            return this.animate.bind(this);
          }
        }
      },

      get target () {
        return this.keyEventTarget;
      },

      keyBindings: {
        'enter:keydown': '_onEnterKeydown',
        'space:keydown': '_onSpaceKeydown',
        'space:keyup': '_onSpaceKeyup'
      },

      attached: function() {
        // Set up a11yKeysBehavior to listen to key events on the target,
        // so that space and enter activate the ripple even if the target doesn't
        // handle key events. The key handlers deal with `noink` themselves.
        if (this.parentNode.nodeType == 11) { // DOCUMENT_FRAGMENT_NODE
          this.keyEventTarget = Polymer.dom(this).getOwnerRoot().host;
        } else {
          this.keyEventTarget = this.parentNode;
        }
        var keyEventTarget = /** @type {!EventTarget} */ (this.keyEventTarget);
        this.listen(keyEventTarget, 'up', 'uiUpAction');
        this.listen(keyEventTarget, 'down', 'uiDownAction');
      },

      detached: function() {
        this.unlisten(this.keyEventTarget, 'up', 'uiUpAction');
        this.unlisten(this.keyEventTarget, 'down', 'uiDownAction');
        this.keyEventTarget = null;
      },

      get shouldKeepAnimating () {
        for (var index = 0; index < this.ripples.length; ++index) {
          if (!this.ripples[index].isAnimationComplete) {
            return true;
          }
        }

        return false;
      },

      simulatedRipple: function() {
        this.downAction(null);

        // Please see polymer/polymer#1305
        this.async(function() {
          this.upAction();
        }, 1);
      },

      /**
       * Provokes a ripple down effect via a UI event,
       * respecting the `noink` property.
       * @param {Event=} event
       */
      uiDownAction: function(event) {
        if (!this.noink) {
          this.downAction(event);
        }
      },

      /**
       * Provokes a ripple down effect via a UI event,
       * *not* respecting the `noink` property.
       * @param {Event=} event
       */
      downAction: function(event) {
        if (this.holdDown && this.ripples.length > 0) {
          return;
        }

        var ripple = this.addRipple();

        ripple.downAction(event);

        if (!this._animating) {
          this._animating = true;
          this.animate();
        }
      },

      /**
       * Provokes a ripple up effect via a UI event,
       * respecting the `noink` property.
       * @param {Event=} event
       */
      uiUpAction: function(event) {
        if (!this.noink) {
          this.upAction(event);
        }
      },

      /**
       * Provokes a ripple up effect via a UI event,
       * *not* respecting the `noink` property.
       * @param {Event=} event
       */
      upAction: function(event) {
        if (this.holdDown) {
          return;
        }

        this.ripples.forEach(function(ripple) {
          ripple.upAction(event);
        });

        this._animating = true;
        this.animate();
      },

      onAnimationComplete: function() {
        this._animating = false;
        this.$.background.style.backgroundColor = null;
        this.fire('transitionend');
      },

      addRipple: function() {
        var ripple = new Ripple(this);

        Polymer.dom(this.$.waves).appendChild(ripple.waveContainer);
        this.$.background.style.backgroundColor = ripple.color;
        this.ripples.push(ripple);

        this._setAnimating(true);

        return ripple;
      },

      removeRipple: function(ripple) {
        var rippleIndex = this.ripples.indexOf(ripple);

        if (rippleIndex < 0) {
          return;
        }

        this.ripples.splice(rippleIndex, 1);

        ripple.remove();

        if (!this.ripples.length) {
          this._setAnimating(false);
        }
      },

      /**
       * This conflicts with Element#antimate().
       * https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
       * @suppress {checkTypes}
       */
      animate: function() {
        if (!this._animating) {
          return;
        }
        var index;
        var ripple;

        for (index = 0; index < this.ripples.length; ++index) {
          ripple = this.ripples[index];

          ripple.draw();

          this.$.background.style.opacity = ripple.outerOpacity;

          if (ripple.isOpacityFullyDecayed && !ripple.isRestingAtMaxRadius) {
            this.removeRipple(ripple);
          }
        }

        if (!this.shouldKeepAnimating && this.ripples.length === 0) {
          this.onAnimationComplete();
        } else {
          window.requestAnimationFrame(this._boundAnimate);
        }
      },

      _onEnterKeydown: function() {
        this.uiDownAction();
        this.async(this.uiUpAction, 1);
      },

      _onSpaceKeydown: function() {
        this.uiDownAction();
      },

      _onSpaceKeyup: function() {
        this.uiUpAction();
      },

      // note: holdDown does not respect noink since it can be a focus based
      // effect.
      _holdDownChanged: function(newVal, oldVal) {
        if (oldVal === undefined) {
          return;
        }
        if (newVal) {
          this.downAction();
        } else {
          this.upAction();
        }
      }

      /**
      Fired when the animation finishes.
      This is useful if you want to wait until
      the ripple animation finishes to perform some action.

      @event transitionend
      @param {{node: Object}} detail Contains the animated node.
      */
    });
  })();
/**
   * `Polymer.PaperRippleBehavior` dynamically implements a ripple
   * when the element has focus via pointer or keyboard.
   *
   * NOTE: This behavior is intended to be used in conjunction with and after
   * `Polymer.IronButtonState` and `Polymer.IronControlState`.
   *
   * @polymerBehavior Polymer.PaperRippleBehavior
   */
  Polymer.PaperRippleBehavior = {
    properties: {
      /**
       * If true, the element will not produce a ripple effect when interacted
       * with via the pointer.
       */
      noink: {
        type: Boolean,
        observer: '_noinkChanged'
      },

      /**
       * @type {Element|undefined}
       */
      _rippleContainer: {
        type: Object,
      }
    },

    /**
     * Ensures a `<paper-ripple>` element is available when the element is
     * focused.
     */
    _buttonStateChanged: function() {
      if (this.focused) {
        this.ensureRipple();
      }
    },

    /**
     * In addition to the functionality provided in `IronButtonState`, ensures
     * a ripple effect is created when the element is in a `pressed` state.
     */
    _downHandler: function(event) {
      Polymer.IronButtonStateImpl._downHandler.call(this, event);
      if (this.pressed) {
        this.ensureRipple(event);
      }
    },

    /**
     * Ensures this element contains a ripple effect. For startup efficiency
     * the ripple effect is dynamically on demand when needed.
     * @param {!Event=} optTriggeringEvent (optional) event that triggered the
     * ripple.
     */
    ensureRipple: function(optTriggeringEvent) {
      if (!this.hasRipple()) {
        this._ripple = this._createRipple();
        this._ripple.noink = this.noink;
        var rippleContainer = this._rippleContainer || this.root;
        if (rippleContainer) {
          Polymer.dom(rippleContainer).appendChild(this._ripple);
        }
        if (optTriggeringEvent) {
          // Check if the event happened inside of the ripple container
          // Fall back to host instead of the root because distributed text
          // nodes are not valid event targets
          var domContainer = Polymer.dom(this._rippleContainer || this);
          var target = Polymer.dom(optTriggeringEvent).rootTarget;
          if (domContainer.deepContains( /** @type {Node} */(target))) {
            this._ripple.uiDownAction(optTriggeringEvent);
          }
        }
      }
    },

    /**
     * Returns the `<paper-ripple>` element used by this element to create
     * ripple effects. The element's ripple is created on demand, when
     * necessary, and calling this method will force the
     * ripple to be created.
     */
    getRipple: function() {
      this.ensureRipple();
      return this._ripple;
    },

    /**
     * Returns true if this element currently contains a ripple effect.
     * @return {boolean}
     */
    hasRipple: function() {
      return Boolean(this._ripple);
    },

    /**
     * Create the element's ripple effect via creating a `<paper-ripple>`.
     * Override this method to customize the ripple element.
     * @return {!PaperRippleElement} Returns a `<paper-ripple>` element.
     */
    _createRipple: function() {
      return /** @type {!PaperRippleElement} */ (
          document.createElement('paper-ripple'));
    },

    _noinkChanged: function(noink) {
      if (this.hasRipple()) {
        this._ripple.noink = noink;
      }
    }
  };
/**
   * `Polymer.PaperInkyFocusBehavior` implements a ripple when the element has keyboard focus.
   *
   * @polymerBehavior Polymer.PaperInkyFocusBehavior
   */
  Polymer.PaperInkyFocusBehaviorImpl = {
    observers: [
      '_focusedChanged(receivedFocusFromKeyboard)'
    ],

    _focusedChanged: function(receivedFocusFromKeyboard) {
      if (receivedFocusFromKeyboard) {
        this.ensureRipple();
      }
      if (this.hasRipple()) {
        this._ripple.holdDown = receivedFocusFromKeyboard;
      }
    },

    _createRipple: function() {
      var ripple = Polymer.PaperRippleBehavior._createRipple();
      ripple.id = 'ink';
      ripple.setAttribute('center', '');
      ripple.classList.add('circle');
      return ripple;
    }
  };

  /** @polymerBehavior Polymer.PaperInkyFocusBehavior */
  Polymer.PaperInkyFocusBehavior = [
    Polymer.IronButtonState,
    Polymer.IronControlState,
    Polymer.PaperRippleBehavior,
    Polymer.PaperInkyFocusBehaviorImpl
  ];
Polymer({
      is: 'paper-icon-button',

      hostAttributes: {
        role: 'button',
        tabindex: '0'
      },

      behaviors: [
        Polymer.PaperInkyFocusBehavior
      ],

      properties: {
        /**
         * The URL of an image for the icon. If the src property is specified,
         * the icon property should not be.
         */
        src: {
          type: String
        },

        /**
         * Specifies the icon name or index in the set of icons available in
         * the icon's icon set. If the icon property is specified,
         * the src property should not be.
         */
        icon: {
          type: String
        },

        /**
         * Specifies the alternate text for the button, for accessibility.
         */
        alt: {
          type: String,
          observer: "_altChanged"
        }
      },

      _altChanged: function(newValue, oldValue) {
        var label = this.getAttribute('aria-label');

        // Don't stomp over a user-set aria-label.
        if (!label || oldValue == label) {
          this.setAttribute('aria-label', newValue);
        }
      }
    });
/**
   * The `iron-iconset-svg` element allows users to define their own icon sets
   * that contain svg icons. The svg icon elements should be children of the
   * `iron-iconset-svg` element. Multiple icons should be given distinct id's.
   *
   * Using svg elements to create icons has a few advantages over traditional
   * bitmap graphics like jpg or png. Icons that use svg are vector based so
   * they are resolution independent and should look good on any device. They
   * are stylable via css. Icons can be themed, colorized, and even animated.
   *
   * Example:
   *
   *     <iron-iconset-svg name="my-svg-icons" size="24">
   *       <svg>
   *         <defs>
   *           <g id="shape">
   *             <rect x="12" y="0" width="12" height="24" />
   *             <circle cx="12" cy="12" r="12" />
   *           </g>
   *         </defs>
   *       </svg>
   *     </iron-iconset-svg>
   *
   * This will automatically register the icon set "my-svg-icons" to the iconset
   * database.  To use these icons from within another element, make a
   * `iron-iconset` element and call the `byId` method
   * to retrieve a given iconset. To apply a particular icon inside an
   * element use the `applyIcon` method. For example:
   *
   *     iconset.applyIcon(iconNode, 'car');
   *
   * @element iron-iconset-svg
   * @demo demo/index.html
   * @implements {Polymer.Iconset}
   */
  Polymer({
    is: 'iron-iconset-svg',

    properties: {

      /**
       * The name of the iconset.
       */
      name: {
        type: String,
        observer: '_nameChanged'
      },

      /**
       * The size of an individual icon. Note that icons must be square.
       */
      size: {
        type: Number,
        value: 24
      },

      /**
       * Set to true to enable mirroring of icons where specified when they are
       * stamped. Icons that should be mirrored should be decorated with a
       * `mirror-in-rtl` attribute.
       *
       * NOTE: For performance reasons, direction will be resolved once per
       * document per iconset, so moving icons in and out of RTL subtrees will
       * not cause their mirrored state to change.
       */
      rtlMirroring: {
        type: Boolean,
        value: false
      }
    },

    attached: function() {
      this.style.display = 'none';
    },

    /**
     * Construct an array of all icon names in this iconset.
     *
     * @return {!Array} Array of icon names.
     */
    getIconNames: function() {
      this._icons = this._createIconMap();
      return Object.keys(this._icons).map(function(n) {
        return this.name + ':' + n;
      }, this);
    },

    /**
     * Applies an icon to the given element.
     *
     * An svg icon is prepended to the element's shadowRoot if it exists,
     * otherwise to the element itself.
     *
     * If RTL mirroring is enabled, and the icon is marked to be mirrored in
     * RTL, the element will be tested (once and only once ever for each
     * iconset) to determine the direction of the subtree the element is in.
     * This direction will apply to all future icon applications, although only
     * icons marked to be mirrored will be affected.
     *
     * @method applyIcon
     * @param {Element} element Element to which the icon is applied.
     * @param {string} iconName Name of the icon to apply.
     * @return {?Element} The svg element which renders the icon.
     */
    applyIcon: function(element, iconName) {
      // insert svg element into shadow root, if it exists
      element = element.root || element;
      // Remove old svg element
      this.removeIcon(element);
      // install new svg element
      var svg = this._cloneIcon(iconName,
          this.rtlMirroring && this._targetIsRTL(element));
      if (svg) {
        var pde = Polymer.dom(element);
        pde.insertBefore(svg, pde.childNodes[0]);
        return element._svgIcon = svg;
      }
      return null;
    },

    /**
     * Remove an icon from the given element by undoing the changes effected
     * by `applyIcon`.
     *
     * @param {Element} element The element from which the icon is removed.
     */
    removeIcon: function(element) {
      // Remove old svg element
      element = element.root || element;
      if (element._svgIcon) {
        Polymer.dom(element).removeChild(element._svgIcon);
        element._svgIcon = null;
      }
    },

    /**
     * Measures and memoizes the direction of the element. Note that this
     * measurement is only done once and the result is memoized for future
     * invocations.
     */
    _targetIsRTL: function(target) {
      if (this.__targetIsRTL == null) {
        if (target && target.nodeType !== Node.ELEMENT_NODE) {
          target = target.host;
        }

        this.__targetIsRTL = target &&
            window.getComputedStyle(target)['direction'] === 'rtl';
      }

      return this.__targetIsRTL;
    },

    /**
     *
     * When name is changed, register iconset metadata
     *
     */
    _nameChanged: function() {
      new Polymer.IronMeta({type: 'iconset', key: this.name, value: this});
      this.async(function() {
        this.fire('iron-iconset-added', this, {node: window});
      });
    },

    /**
     * Create a map of child SVG elements by id.
     *
     * @return {!Object} Map of id's to SVG elements.
     */
    _createIconMap: function() {
      // Objects chained to Object.prototype (`{}`) have members. Specifically,
      // on FF there is a `watch` method that confuses the icon map, so we
      // need to use a null-based object here.
      var icons = Object.create(null);
      Polymer.dom(this).querySelectorAll('[id]')
        .forEach(function(icon) {
          icons[icon.id] = icon;
        });
      return icons;
    },

    /**
     * Produce installable clone of the SVG element matching `id` in this
     * iconset, or `undefined` if there is no matching element.
     *
     * @return {Element} Returns an installable clone of the SVG element
     * matching `id`.
     */
    _cloneIcon: function(id, mirrorAllowed) {
      // create the icon map on-demand, since the iconset itself has no discrete
      // signal to know when it's children are fully parsed
      this._icons = this._icons || this._createIconMap();
      return this._prepareSvgClone(this._icons[id], this.size, mirrorAllowed);
    },

    /**
     * @param {Element} sourceSvg
     * @param {number} size
     * @param {Boolean} mirrorAllowed
     * @return {Element}
     */
    _prepareSvgClone: function(sourceSvg, size, mirrorAllowed) {
      if (sourceSvg) {
        var content = sourceSvg.cloneNode(true),
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
            viewBox = content.getAttribute('viewBox') || '0 0 ' + size + ' ' + size,
            cssText = 'pointer-events: none; display: block; width: 100%; height: 100%;';

        if (mirrorAllowed && content.hasAttribute('mirror-in-rtl')) {
          cssText += '-webkit-transform:scale(-1,1);transform:scale(-1,1);';
        }

        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        // TODO(dfreedm): `pointer-events: none` works around https://crbug.com/370136
        // TODO(sjmiles): inline style may not be ideal, but avoids requiring a shadow-root
        svg.style.cssText = cssText;
        svg.appendChild(content).removeAttribute('id');
        return svg;
      }
      return null;
    }

  });
// Setup Polymer options
    window.Polymer = {
      dom: 'shadow',
      lazyRegister: true
    };

    Polymer({
      is: 'my-app',

      properties: {
        page: {
          type: String,
          reflectToAttribute: true,
          observer: '_pageChanged'
        }
      },

      observers: [
        '_routePageChanged(routeData.page)'
      ],

      _routePageChanged: function(page) {
        this.page = page || 'view1';

        if (!this.$.drawer.persistent) {
          this.$.drawer.close();
        }
      },

      _pageChanged: function(page) {
        // Load page import on demand. Show 404 page if fails
        var resolvedPageUrl = 'src/my-' + page + '.html'; //this.resolveUrl('my-' + page + '.html');
        console.log("resolve", page, "=>", resolvedPageUrl)
        this.importHref(resolvedPageUrl, null, this._showPage404, true);
      },

      _showPage404: function() {
        this.page = 'view404';
      }
    });