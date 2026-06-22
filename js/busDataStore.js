/**
 * Shared bus data layer for admin + passenger pages.
 * Buses are never deleted — use is_active true/false.
 * Admin changes persist in localStorage; initial data comes from timeTable.json.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "busAdminData";
  var WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  var ALL_DAYS = WEEKDAYS.concat(["Saturday", "Sunday"]);

  var state = {
    buses: [],
    alerts: [],
    recentUpdates: [],
    ready: false,
  };

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "bus-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function scheduleKeyToDays(key) {
    if (key === "Monday-Friday") return WEEKDAYS.slice();
    if (key === "Saturday") return ["Saturday"];
    if (key === "Sunday") return ["Sunday"];
    return [];
  }

  function daysToScheduleKeys(days) {
    var keys = {};
    var hasWeekday = days.some(function (d) {
      return WEEKDAYS.indexOf(d) !== -1;
    });
    if (hasWeekday) keys["Monday-Friday"] = true;
    if (days.indexOf("Saturday") !== -1) keys["Saturday"] = true;
    if (days.indexOf("Sunday") !== -1) keys["Sunday"] = true;
    return keys;
  }

  function formatDaysLabel(days) {
    if (!days || !days.length) return "None";
    if (days.length === 7) return "Every day";
    var sorted = ALL_DAYS.filter(function (d) {
      return days.indexOf(d) !== -1;
    });
    if (
      sorted.length === 5 &&
      WEEKDAYS.every(function (d) {
        return sorted.indexOf(d) !== -1;
      })
    ) {
      return "Mon–Fri";
    }
    return sorted.map(function (d) {
      return d.slice(0, 3);
    }).join(", ");
  }

  function flattenTimeTable(json) {
    var buses = [];

    Object.keys(json).forEach(function (from) {
      Object.keys(json[from]).forEach(function (to) {
        Object.keys(json[from][to]).forEach(function (scheduleKey) {
          var days = scheduleKeyToDays(scheduleKey);
          json[from][to][scheduleKey].forEach(function (bus) {
            buses.push({
              id: bus.bus_id || generateId(),
              bus_id: bus.bus_id || generateId(),
              bus_number: bus.bus_number || "",
              company_name: bus.company_name || "Bus Company",
              route_from: from,
              route_to: to,
              departure_time: bus.time || "",
              days: days.slice(),
              is_active: bus.is_active !== false,
              route: bus.route || from + " to " + to,
            });
          });
        });
      });
    });

    return buses;
  }

  function busesToTimetable(buses) {
    var result = {};
    var activeBuses = buses.filter(function (b) {
      return b.is_active === true;
    });

    activeBuses.forEach(function (bus) {
      var from = bus.route_from;
      var to = bus.route_to;
      if (!result[from]) result[from] = {};
      if (!result[from][to]) result[from][to] = {};

      var scheduleKeys = daysToScheduleKeys(bus.days || []);
      Object.keys(scheduleKeys).forEach(function (key) {
        if (!result[from][to][key]) result[from][to][key] = [];
        result[from][to][key].push({
          bus_id: bus.bus_id || bus.id,
          bus_number: bus.bus_number,
          time: bus.departure_time,
          route: bus.route || from + " to " + to,
        });
      });
    });

    return result;
  }

  function getUniqueRoutes(buses) {
    var seen = {};
    var routes = [];

    buses.forEach(function (bus) {
      var label = bus.route_from + " \u2192 " + bus.route_to;
      var key = bus.route_from + "|" + bus.route_to;
      if (!seen[key]) {
        seen[key] = true;
        routes.push({
          from: bus.route_from,
          to: bus.route_to,
          label: label,
          activeCount: 0,
          totalCount: 0,
        });
      }
    });

    buses.forEach(function (bus) {
      var key = bus.route_from + "|" + bus.route_to;
      routes.forEach(function (route) {
        if (route.from + "|" + route.to === key) {
          route.totalCount += 1;
          if (bus.is_active) route.activeCount += 1;
        }
      });
    });

    return routes.sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[BusDataStore] Could not read localStorage:", err);
      return null;
    }
  }

  function saveToStorage() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        buses: state.buses,
        alerts: state.alerts,
        recentUpdates: state.recentUpdates,
      }),
    );
  }

  function addRecentUpdate(text) {
    state.recentUpdates.unshift({
      id: generateId(),
      text: text,
      timestamp: new Date().toISOString(),
    });
    state.recentUpdates = state.recentUpdates.slice(0, 20);
  }

  function init() {
    if (state.ready) {
      return Promise.resolve(state);
    }

    var stored = loadFromStorage();
    if (stored && stored.buses && stored.buses.length) {
      state.buses = stored.buses;
      state.alerts = stored.alerts || [];
      state.recentUpdates = stored.recentUpdates || [];
      state.ready = true;
      return Promise.resolve(state);
    }

    return fetch("data/timeTable.json")
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        state.buses = flattenTimeTable(json);
        state.alerts = [];
        state.recentUpdates = [];
        saveToStorage();
        state.ready = true;
        return state;
      })
      .catch(function (err) {
        console.error("[BusDataStore] Failed to load timetable:", err);
        state.ready = true;
        return state;
      });
  }

  window.BusDataStore = {
    ALL_DAYS: ALL_DAYS,
    WEEKDAYS: WEEKDAYS,

    init: init,

    getTimetableData: function () {
      return busesToTimetable(state.buses);
    },

    getAllBuses: function () {
      return state.buses.slice();
    },

    getActiveAlerts: function () {
      return state.alerts.filter(function (a) {
        return a.is_active !== false;
      });
    },

    getStats: function () {
      var total = state.buses.length;
      var active = state.buses.filter(function (b) {
        return b.is_active;
      }).length;
      return {
        totalBuses: total,
        activeBuses: active,
        hiddenBuses: total - active,
        activeRoutes: getUniqueRoutes(state.buses).filter(function (r) {
          return r.activeCount > 0;
        }).length,
      };
    },

    getRoutes: function () {
      return getUniqueRoutes(state.buses);
    },

    getRecentUpdates: function () {
      return state.recentUpdates.slice();
    },

    formatDaysLabel: formatDaysLabel,

    getBusById: function (id) {
      return state.buses.find(function (b) {
        return b.id === id;
      });
    },

    saveBus: function (busData, options) {
      options = options || {};
      var isEdit = !!busData.id;
      var record = {
        id: busData.id || generateId(),
        bus_id: busData.bus_id || busData.id || generateId(),
        bus_number: (busData.bus_number || "").trim(),
        company_name: (busData.company_name || "").trim(),
        route_from: (busData.route_from || "").trim(),
        route_to: (busData.route_to || "").trim(),
        departure_time: (busData.departure_time || "").trim(),
        days: busData.days || [],
        is_active: busData.is_active !== false,
        route:
          (busData.route_from || "").trim() +
          " to " +
          (busData.route_to || "").trim(),
      };

      if (isEdit) {
        var index = state.buses.findIndex(function (b) {
          return b.id === record.id;
        });
        if (index !== -1) {
          record.bus_id = state.buses[index].bus_id || record.bus_id;
          state.buses[index] = record;
          if (!options.silent) {
            addRecentUpdate(
              "Updated Bus " +
                record.bus_number +
                " (" +
                record.route_from +
                " \u2192 " +
                record.route_to +
                ")",
            );
          }
        }
      } else {
        state.buses.push(record);
        addRecentUpdate(
          "Added Bus " +
            record.bus_number +
            " (" +
            record.route_from +
            " \u2192 " +
            record.route_to +
            ")",
        );
      }

      saveToStorage();
      return record;
    },

    setBusActive: function (id, isActive) {
      var bus = this.getBusById(id);
      if (!bus) return null;
      bus.is_active = isActive;
      addRecentUpdate(
        (isActive ? "Showed" : "Hidden") +
          " Bus " +
          bus.bus_number +
          " (" +
          bus.route_from +
          " \u2192 " +
          bus.route_to +
          ")",
      );
      saveToStorage();
      return bus;
    },

    saveAlert: function (alertData) {
      var alert = {
        id: alertData.id || generateId(),
        message: (alertData.message || "").trim(),
        type: alertData.type || "general",
        is_active: alertData.is_active !== false,
        created_at: alertData.created_at || new Date().toISOString(),
      };
      state.alerts.unshift(alert);
      addRecentUpdate("Posted alert: " + alert.message);
      saveToStorage();
      return alert;
    },

    deactivateAlert: function (id) {
      var alert = state.alerts.find(function (a) {
        return a.id === id;
      });
      if (alert) {
        alert.is_active = false;
        saveToStorage();
      }
    },
  };
})();
