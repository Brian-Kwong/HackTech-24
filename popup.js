const onButton = document.getElementById("switch1");
const aiButton = document.getElementById("switch2");

import { extractDomain, makeNewTabGroup, extractTitle } from "./background.js";

function getButtonState() {
  chrome.storage.local.get(["enabled"], (enabled) => {
    if (enabled["enabled"] === undefined) {
      onButton.checked = false;
    } else {
      onButton.checked = enabled["enabled"];
    }
    chrome.storage.local.get(["ai_mode"], (ai) => {
      if (ai["ai_mode"] === undefined) {
        aiButton.checked = true && onButton.checked;
      } else {
        aiButton.checked = ai["ai_mode"];
      }
    });
  });
}

getButtonState();

aiButton.addEventListener("change", () => {
  if (!onButton.checked) {
    aiButton.checked = false;
    alert("Please enable the extension first.");
    return;
  }
  chrome.storage.local.set({ ai_mode: aiButton.checked });
});

onButton.addEventListener("change", function () {
  chrome.storage.local.set({ enabled: onButton.checked });
  if (onButton.checked) {
    var myTabs = [];
    function filterGroups(listOfTitle) {
      var myGroups = [];
      while (listOfTitle.length > 0) {
        var group = [];
        var base = listOfTitle.pop();
        group.push(base);
        var base_url, given_url;
        for (var i = listOfTitle.length - 1; i >= 0; i--) {
          base_url = extractDomain(base["url"]);
          given_url = extractDomain(listOfTitle[i]["url"]);
          if (base_url === given_url) {
            group.push(listOfTitle[i]);
            listOfTitle.splice(i, 1);
          }
        }
        myGroups.push(group);
      }
      return myGroups;
    }
    if (!aiButton.checked) {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          myTabs.push(tab);
        });
        var groupsTabs = filterGroups(myTabs.map((tab) => tab));
        groupsTabs.forEach((group) => {
          makeNewTabGroup(group);
        });
      });
    } else {
      // if the previous tabs have already computed vectors
      const classifyNew = async (tabs, callback) => {
        fetch(server_url, {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(tabs),
        })
          .then((response) => response.json())
          .then((json) => {
            callback(json);
            return 0;
          });
        return 1;
      };
      chrome.tabs.query({}, async (allTabs) => {
        const rawTabs = allTabs;

        let tabs = [];
        for (let i = 0; i < allTabs.length; ++i) {
          if (allTabs[i].title != "New Tab") {
            tabs.push(allTabs[i]);
          }
        }
        if (tabs.length < 1) {
          return 0;
        }

        tabs = tabs.map(
          (tab) =>
            extractTitle(tab.url) +
            " " +
            extractTitle(tab.url) +
            " " +
            tab.title
        ); // ?
        tabs = tabs.map((tab) => tab.replaceAll(" ", "_"));
        classifyNew(tabs, (payload) => {
          // TODO: have clusters be calculated in here
          const groupings = payload.groupings;
          let groupAmount = 0;
          for (let i = 0; i < groupings.length; ++i) {
            if (groupings[i] > groupAmount) {
              groupAmount = groupings[i];
            }
          }
          ++groupAmount;
          let allTabGroups = [];
          for (let i = 0; i < groupAmount; ++i) {
            allTabGroups.push([]);
          }
          for (let i = 0; i < tabs.length; ++i) {
            allTabGroups[groupings[i]].push(rawTabs[i]);
          }
          for (let i = 0; i < groupAmount; ++i) {
            makeNewTabGroup(allTabGroups[i]);
          }
        });
      });
    }
  } else {
    aiButton.checked = false;
    chrome.storage.local.set({ ai_mode: false }, () => {
      chrome.tabGroups.query({}, (groups) => {
        if (groups.length === 0) return;
        groups.forEach((group) => {
          chrome.tabs.query({ groupId: group["id"] }, (tabs) => {
            chrome.tabs.ungroup(
              tabs.map((tab) => tab["id"]),
              () => {}
            );
          });
        });
      });
    });
  }
});
