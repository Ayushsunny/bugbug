import ApexCharts from "apexcharts";
import { Temporal } from "proposal-temporal/lib/index.mjs";
import localForage from "localforage";

// let METABUGS_URL =
//   "https://bugzilla.mozilla.org/rest/bug?include_fields=id,summary,status&keywords=feature-testing-meta%2C%20&keywords_type=allwords";
let LANDINGS_URL =
  "https://community-tc.services.mozilla.com/api/index/v1/task/project.bugbug.landings_risk_report.latest/artifacts/public/landings_by_date.json";
let COMPONENT_CONNECTIONS_URL =
  "https://community-tc.services.mozilla.com/api/index/v1/task/project.bugbug.landings_risk_report.latest/artifacts/public/component_connections.json";
let COMPONENT_TEST_STATS_URL =
  "https://community-tc.services.mozilla.com/api/index/v1/task/project.bugbug.landings_risk_report.latest/artifacts/public/component_test_stats.json";

function getCSSVariableValue(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

const EXPIRE_CACHE = (() => {
  localForage.config({
    driver: localForage.INDEXEDDB,
  });
  return {
    get: async (key) => {
      let data;
      try {
        data = await localForage.getItem(key);
      } catch (e) {}

      if (!data) return data;

      const { expire, value } = data;

      if (expire < Date.now()) {
        localForage.removeItem(key);
        return null;
      }

      return value;
    },
    set: (key, value, expire = false, callback = false) => {
      if (expire && typeof expire === "number")
        expire = Math.round(expire * 1000 + Date.now()); // * 1000 to use seconds

      return localForage.setItem(key, { value, expire }, expire && callback);
    },
  };
})();

export const getPlainDate = (() => {
  const cache = new Map();

  return (date) => {
    let plainDate = cache.get(date);
    if (!plainDate) {
      plainDate = Temporal.PlainDate.from(date);
      cache.set(date, plainDate);
    }

    return plainDate;
  };
})();

export const dateToWeek = (() => {
  const cache = new Map();

  return (dateString) => {
    let weekStart = cache.get(dateString);
    if (!weekStart) {
      const date = getPlainDate(dateString);
      weekStart = date.subtract({ days: date.dayOfWeek }).toString();
      cache.set(dateString, weekStart);
    }

    return weekStart;
  };
})();

export const dateToMonth = (() => {
  const cache = new Map();

  return (dateString) => {
    let yearMonth = cache.get(dateString);
    if (!yearMonth) {
      const date = getPlainDate(dateString);
      yearMonth = Temporal.PlainYearMonth.from(date);
      cache.set(dateString, yearMonth);
    }

    return yearMonth;
  };
})();

export const dateToVersion = (async () => {
  const releases = Object.entries(
    await getFirefoxReleases()
  ).map(([cur_version, cur_date]) => [cur_version, getPlainDate(cur_date)]);
  const cache = new Map();

  return (dateString) => {
    let version = cache.get(dateString);
    if (!version) {
      const date = getPlainDate(dateString);
      for (const [cur_version, cur_date] of releases) {
        if (Temporal.PlainDate.compare(date, cur_date) < 1) {
          break;
        }

        version = cur_version;
      }

      cache.set(dateString, version);
    }

    return version;
  };
})();

export const TESTING_TAGS = {
  "testing-approved": {
    color: getCSSVariableValue("--green-60"),
    label: "approved",
  },
  "testing-exception-unchanged": {
    color: getCSSVariableValue("--teal-60"),
    label: "unchanged",
  },
  "testing-exception-elsewhere": {
    color: getCSSVariableValue("--blue-50"),
    label: "elsewhere",
  },
  "testing-exception-ui": {
    color: getCSSVariableValue("--purple-50"),
    label: "ui",
  },
  "testing-exception-other": {
    color: getCSSVariableValue("--yellow-50"),
    label: "other",
  },
  missing: {
    color: getCSSVariableValue("--red-60"),
    label: "missing",
  },
  unknown: {
    color: getCSSVariableValue("--grey-30"),
    label: "unknown",
  },
};

const HIGH_RISK_COLOR = "rgb(255, 13, 87)";
const MEDIUM_RISK_COLOR = "darkkhaki";
const LOW_RISK_COLOR = "green";

let taskclusterLandingsArtifact = (async function () {
  let json = await EXPIRE_CACHE.get("taskclusterLandingsArtifact");
  if (!json) {
    let response = await fetch(LANDINGS_URL);
    json = await response.json();
    // 30 minutes
    EXPIRE_CACHE.set("taskclusterLandingsArtifact", json, 60 * 30);
  } else {
    console.log("taskclusterLandingsArtifact cache hit", json);
  }

  return json;
})();

let taskclusterComponentConnectionsArtifact = (async function () {
  let json = await EXPIRE_CACHE.get("taskclusterComponentConnectionsArtifact");
  if (!json) {
    let response = await fetch(COMPONENT_CONNECTIONS_URL);
    json = await response.json();
    // 30 minutes
    EXPIRE_CACHE.set("taskclusterComponentConnectionsArtifact", json, 60 * 30);
  } else {
    console.log("taskclusterComponentConnectionsArtifact cache hit", json);
  }

  return json;
})();

export let componentConnections = (async function () {
  let json = await taskclusterComponentConnectionsArtifact;
  return json;
})();

let taskclusterComponentTestStatsArtifact = (async function () {
  let json = await EXPIRE_CACHE.get("taskclusterComponentTestStatsArtifact");
  if (!json) {
    let response = await fetch(COMPONENT_TEST_STATS_URL);
    json = await response.json();
    // 30 minutes
    EXPIRE_CACHE.set("taskclusterComponentTestStatsArtifact", json, 60 * 30);
  } else {
    console.log("taskclusterComponentTestStatsArtifact cache hit", json);
  }

  return json;
})();

let componentTestStats = (async function () {
  let json = await taskclusterComponentTestStatsArtifact;
  return json;
})();

export let featureMetabugs = (async function () {
  let json = await taskclusterLandingsArtifact;
  return json.featureMetaBugs.map((bug) => {
    return {
      id: bug.id,
      summary: bug.summary
        .replace(/\[meta\]/i, "")
        .replace(/\[ux\]/i, "")
        .trim(),
    };
  });
})();

export async function getFirefoxReleases() {
  let response = await fetch(
    "https://product-details.mozilla.org/1.0/firefox_history_major_releases.json"
  );
  return await response.json();
}

export let landingsData = (async function () {
  let json = await taskclusterLandingsArtifact;
  json = json.summaries;

  // Sort the dates so object iteration will be sequential:
  let orderedDates = [];
  for (let date in json) {
    orderedDates.push(date);
  }
  orderedDates.sort((a, b) => {
    return Temporal.PlainDate.compare(getPlainDate(a), getPlainDate(b));
  });

  let returnedObject = {};
  for (let date of orderedDates) {
    returnedObject[date] = json[date];
  }

  document.body.classList.remove("loading-data");

  return returnedObject;
})();

function quantile(array, p) {
  if (array.length === 0) {
    return 0;
  }

  array.sort((a, b) => a - b);

  if (p <= 0 || array.length < 2) {
    return array[0];
  }

  if (p >= 1) {
    return array[n - 1];
  }

  let i = (array.length - 1) * p;
  let i0 = Math.floor(i);
  let value0 = array[i0];
  let value1 = array[i0 + 1];

  return value0 + (value1 - value0) * (i - i0);
}

function median(array) {
  return quantile(array, 0.5);
}

export class Counter {
  constructor(initialValue = () => 0) {
    return new Proxy(
      {},
      {
        get: (target, name) => {
          if (name in target) {
            return target[name];
          }

          let val = initialValue();
          target[name] = val;
          return val;
        },
      }
    );
  }
}

export async function getSummaryData(
  bugSummaries,
  grouping = "daily",
  startDate,
  counter,
  filter,
  dateGetter = (summary) => summary.date,
  initialValue = () => 0
) {
  let dates = [...new Set(bugSummaries.map((summary) => dateGetter(summary)))];
  dates.sort((a, b) =>
    Temporal.PlainDate.compare(getPlainDate(a), getPlainDate(b))
  );

  let dailyData = {};
  for (let date of dates) {
    if (Temporal.PlainDate.compare(getPlainDate(date), startDate) == -1) {
      continue;
    }

    dailyData[date] = new Counter(initialValue);
  }

  for (let summary of bugSummaries) {
    let counterObj = dailyData[dateGetter(summary)];
    if (!counterObj) {
      continue;
    }

    if (filter && !filter(summary)) {
      continue;
    }

    counter(counterObj, summary);
  }

  if (grouping == "daily") {
    return dailyData;
  }

  const labels = [
    ...new Set(Object.values(dailyData).flatMap((data) => Object.keys(data))),
  ];

  function _merge(val, cur) {
    if (Array.isArray(val)) {
      return val.concat(cur);
    } else {
      return val + cur;
    }
  }

  let groupDate;
  if (grouping == "weekly") {
    groupDate = dateToWeek;
  } else if (grouping == "monthly") {
    groupDate = dateToMonth;
  } else if (grouping == "by_release") {
    groupDate = await dateToVersion;
  } else {
    throw new Error(`Unexpected grouping: ${grouping}`);
  }

  let groupedData = {};
  for (const daily in dailyData) {
    const group = groupDate(daily);

    if (!groupedData[group]) {
      groupedData[group] = new Counter(initialValue);
    }

    for (const label of labels) {
      groupedData[group][label] = _merge(
        groupedData[group][label],
        dailyData[daily][label]
      );
    }
  }
  return groupedData;
}

export async function getTestingPolicySummaryData(grouping = "daily", filter) {
  let bugSummaries = [].concat
    .apply([], Object.values(await landingsData))
    .filter((summary) => summary.date);

  return getSummaryData(
    bugSummaries,
    grouping,
    getPlainDate("2020-09-01"), // Ignore data before the testing policy took place.
    (counterObj, bug) => {
      for (let commit of bug.commits) {
        if (!commit.testing) {
          counterObj.unknown++;
        } else {
          counterObj[commit.testing] += 1;
        }
      }
    },
    filter
  );
}

export function renderChart(
  chartEl,
  series,
  dates,
  title,
  yaxis_text,
  yaxis_options = {},
  tooltip = {}
) {
  yaxis_options["title"] = {
    text: yaxis_text,
  };

  let options = {
    series: series,
    chart: {
      height: 350,
      type: "line",
      toolbar: {
        show: false,
      },
      animations: {
        enabled: false,
      },
    },
    dataLabels: {
      enabled: true,
    },
    stroke: {
      curve: "smooth",
    },
    title: {
      text: title,
      align: "left",
    },
    grid: {
      borderColor: "#e7e7e7",
      row: {
        colors: ["#f3f3f3", "transparent"],
        opacity: 0.5,
      },
    },
    xaxis: {
      categories: dates,
      title: {
        text: "Date",
      },
    },
    yaxis: yaxis_options,
    legend: {
      position: "top",
      horizontalAlign: "right",
      floating: true,
      offsetY: -25,
      offsetX: -5,
    },
    tooltip: tooltip,
  };

  let chart = new ApexCharts(chartEl, options);
  chart.render();
}

export function renderTestingChart(chartEl, bugSummaries) {
  let testingCounts = new Counter();
  bugSummaries.forEach((summary) => {
    summary.commits.forEach((commit) => {
      if (!commit.testing) {
        testingCounts.unknown++;
      } else {
        testingCounts[commit.testing] = testingCounts[commit.testing] + 1;
      }
    });
  });

  let categories = [];
  let colors = [];
  let data = [];
  for (let tag in testingCounts) {
    categories.push(TESTING_TAGS[tag].label);
    data.push(testingCounts[tag]);
    colors.push(TESTING_TAGS[tag].color);
  }

  var options = {
    series: [
      {
        name: "Tags",
        data,
      },
    ],
    chart: {
      height: 150,
      type: "bar",
      animations: {
        enabled: false,
      },
    },
    plotOptions: {
      bar: {
        dataLabels: {
          position: "top", // top, center, bottom
        },
      },
    },

    xaxis: {
      categories,
      // position: "bottom",
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      labels: {
        show: false,
      },
    },
  };

  var chart = new ApexCharts(chartEl, options);
  chart.render();
}

export async function renderRiskChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter(
    (bugSummary) => bugSummary.risk_band !== null
  );

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.date),
        getPlainDate(minSummary.date)
      ) < 0
        ? summary
        : minSummary
    ).date
  );

  // Enforce up to 2 months history, earlier patches are in the model's training set.
  let twoMonthsAgo = Temporal.now.plainDateISO().subtract({ months: 2 });
  if (Temporal.PlainDate.compare(twoMonthsAgo, minDate) > 0) {
    minDate = twoMonthsAgo;
  }

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, summary) => {
      if (summary.risk_band == "l") {
        counterObj.low += 1;
      } else if (summary.risk_band == "a") {
        counterObj.medium += 1;
      } else {
        counterObj.high += 1;
      }
    }
  );

  let categories = [];
  let high = [];
  let medium = [];
  let low = [];
  for (let date in summaryData) {
    categories.push(date);
    low.push(summaryData[date].low);
    medium.push(summaryData[date].medium);
    high.push(summaryData[date].high);
  }

  renderChart(
    chartEl,
    [
      {
        name: "Higher",
        data: high,
      },
      {
        name: "Average",
        data: medium,
      },
      {
        name: "Lower",
        data: low,
      },
    ],
    categories,
    "Evolution of lower/average/higher risk changes",
    "# of patches"
  );
}

export async function renderRegressionsChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter((bugSummary) => bugSummary.regression);

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryOpenData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      if (bug.regression) {
        counterObj.regressions += 1;
      }
    },
    null,
    (summary) => summary.creation_date
  );

  let summaryFixData = await getSummaryData(
    bugSummaries.filter((bug) => bug.fixed && !!bug.date),
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      const days = getPlainDate(bug.creation_date).until(
        getPlainDate(bug.date),
        {
          largestUnit: "days",
        }
      ).days;

      if (days <= 7) {
        counterObj.fixed_week_regressions += 1;
      } else if (days <= 31) {
        counterObj.fixed_month_regressions += 1;
      } else if (days <= 365) {
        counterObj.fixed_year_regressions += 1;
      } else {
        counterObj.fixed_ancient_regressions += 1;
      }
    },
    null,
    (summary) => summary.date
  );

  let categories = [];
  let regressions = [];
  let fixed_week_regressions = [];
  let fixed_month_regressions = [];
  let fixed_year_regressions = [];
  let fixed_ancient_regressions = [];
  for (const date in summaryOpenData) {
    categories.push(date);
    regressions.push(summaryOpenData[date].regressions);
    if (date in summaryFixData) {
      fixed_week_regressions.push(summaryFixData[date].fixed_week_regressions);
      fixed_month_regressions.push(
        summaryFixData[date].fixed_month_regressions
      );
      fixed_year_regressions.push(summaryFixData[date].fixed_year_regressions);
      fixed_ancient_regressions.push(
        summaryFixData[date].fixed_ancient_regressions
      );
    } else {
      fixed_week_regressions.push(0);
      fixed_month_regressions.push(0);
      fixed_year_regressions.push(0);
      fixed_ancient_regressions.push(0);
    }
  }

  const options = {
    series: [
      {
        name: "New regressions",
        data: regressions,
      },
      {
        name: "Fixed < 1 week old regressions",
        data: fixed_week_regressions,
      },
      {
        name: "Fixed < 1 month old regressions",
        data: fixed_month_regressions,
      },
      {
        name: "Fixed < 1 year old regressions",
        data: fixed_year_regressions,
      },
      {
        name: "Fixed > 1 year old regressions",
        data: fixed_ancient_regressions,
      },
    ],
    chart: {
      type: "bar",
      height: 350,
      stacked: true,
      toolbar: {
        show: false,
      },
      animations: {
        enabled: false,
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 8,
        horizontal: false,
      },
    },
    xaxis: {
      categories: categories,
      title: {
        text: "Date",
      },
    },
    legend: {
      position: "right",
      offsetY: 40,
    },
    fill: {
      opacity: 1,
    },
  };

  let chart = new ApexCharts(chartEl, options);
  chart.render();
}

export async function renderTypesChart(chartEl, bugSummaries) {
  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      for (const type of bug.types) {
        counterObj[type] += 1;
      }

      if (bug.severity == "S1") {
        counterObj.s1 += 1;
      } else if (bug.severity == "S2") {
        counterObj.s2 += 1;
      }
    },
    null,
    (summary) => summary.creation_date
  );

  let all_series = [
    { name: "s1", data: [] },
    { name: "s2", data: [] },
  ];
  for (let type of allBugTypes) {
    if (type == "unknown") {
      continue;
    }

    all_series.push({
      name: type,
      data: [],
    });
  }

  let categories = [];
  for (let date in summaryData) {
    categories.push(date);
    for (let series of all_series) {
      series["data"].push(summaryData[date][series["name"]]);
    }
  }

  renderChart(
    chartEl,
    all_series,
    categories,
    "Number of bugs by severity and type",
    "# of bugs"
  );
}

export async function renderFixTimesChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter((bugSummary) => bugSummary.date !== null);

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      counterObj.fix_times.push(
        getPlainDate(bug.creation_date).until(getPlainDate(bug.date), {
          largestUnit: "days",
        }).days
      );
    },
    null,
    (summary) => summary.creation_date,
    () => []
  );

  let categories = [];
  let ninthdecile_fix_times = [];
  let median_fix_times = [];
  for (let date in summaryData) {
    categories.push(date);
    ninthdecile_fix_times.push(
      quantile(summaryData[date].fix_times, 0.9).toFixed(1)
    );
    median_fix_times.push(median(summaryData[date].fix_times).toFixed(1));
  }

  renderChart(
    chartEl,
    [
      {
        name: "90% time to fix",
        data: ninthdecile_fix_times,
      },
      {
        name: "Median time to fix",
        data: median_fix_times,
      },
    ],
    categories,
    "Time to fix",
    "Days"
  );
}

export async function renderTimeToBugChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter(
    (bugSummary) => bugSummary.time_to_bug !== null
  );

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      counterObj.times_to_bug.push(bug.time_to_bug);
    },
    null,
    (summary) => summary.creation_date,
    () => []
  );

  let categories = [];
  let ninthdecile_time_to_bug = [];
  let median_time_to_bug = [];
  for (let date in summaryData) {
    categories.push(date);
    ninthdecile_time_to_bug.push(
      quantile(summaryData[date].times_to_bug, 0.9).toFixed(1)
    );
    median_time_to_bug.push(median(summaryData[date].times_to_bug).toFixed(1));
  }

  renderChart(
    chartEl,
    [
      {
        name: "90% time to bug",
        data: ninthdecile_time_to_bug,
      },
      {
        name: "Median time to bug",
        data: median_time_to_bug,
      },
    ],
    categories,
    "Time to bug",
    "Days"
  );
}

export async function renderTimeToConfirmChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter(
    (bugSummary) => bugSummary.time_to_confirm !== null
  );

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      counterObj.times_to_confirm.push(bug.time_to_confirm);
    },
    null,
    (summary) => summary.creation_date,
    () => []
  );

  let categories = [];
  let ninthdecile_time_to_confirm = [];
  let median_time_to_confirm = [];
  const bugs_number = [];
  for (let date in summaryData) {
    categories.push(date);
    ninthdecile_time_to_confirm.push(
      quantile(summaryData[date].times_to_confirm, 0.9).toFixed(1)
    );
    median_time_to_confirm.push(
      median(summaryData[date].times_to_confirm).toFixed(1)
    );
    bugs_number.push(summaryData[date].times_to_confirm.length);
  }

  renderChart(
    chartEl,
    [
      {
        name: "90% time to confirm",
        data: ninthdecile_time_to_confirm,
      },
      {
        name: "Median time to confirm",
        data: median_time_to_confirm,
      },
    ],
    categories,
    "Time to confirm",
    "Days",
    {},
    {
      custom: function ({ series, seriesIndex, dataPointIndex, w }) {
        return (
          `<div class="apexcharts-tooltip-title">${categories[dataPointIndex]}</div>` +
          `<div class="apexcharts-tooltip-series-group apexcharts-active" style="order: 1; display: flex;">` +
          `<span class="apexcharts-tooltip-marker" style="background-color: rgb(0, 143, 251);"></span>` +
          `<div class="apexcharts-tooltip-text" style="font-family: Helvetica, Arial, sans-serif; font-size: 12px;">` +
          `<div class="apexcharts-tooltip-y-group">` +
          `<span class="apexcharts-tooltip-text-label">90% time to confirm: </span>` +
          `<span class="apexcharts-tooltip-text-value">${ninthdecile_time_to_confirm[dataPointIndex]}</span>` +
          `</div>` +
          `</div>` +
          `</div>` +
          `<div class="apexcharts-tooltip-series-group apexcharts-active" style="order: 2; display: flex;">` +
          `<span class="apexcharts-tooltip-marker" style="background-color: rgb(0, 227, 150);"></span>` +
          `<div class="apexcharts-tooltip-text" style="font-family: Helvetica, Arial, sans-serif; font-size: 12px;">` +
          `<div class="apexcharts-tooltip-y-group">` +
          `<span class="apexcharts-tooltip-text-label">Median time to confirm: </span>` +
          `<span class="apexcharts-tooltip-text-value">${median_time_to_confirm[dataPointIndex]}</span>` +
          `</div>` +
          `</div>` +
          `</div>` +
          `<div class="apexcharts-tooltip-series-group apexcharts-active" style="order: 3; display: flex;">` +
          `<span class="apexcharts-tooltip-marker" style=""></span>` +
          `<div class="apexcharts-tooltip-text" style="font-family: Helvetica, Arial, sans-serif; font-size: 12px;">` +
          `<div class="apexcharts-tooltip-y-group">` +
          `<span class="apexcharts-tooltip-text-label">Number of bugs: </span>` +
          `<span class="apexcharts-tooltip-text-value">${bugs_number[dataPointIndex]}</span>` +
          `</div>` +
          `</div>` +
          `</div>`
        );
      },
    }
  );
}

export async function renderPatchCoverageChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter((bugSummary) => bugSummary.date !== null);

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.date),
        getPlainDate(minSummary.date)
      ) < 0
        ? summary
        : minSummary
    ).date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      let [lines_added, lines_covered, lines_unknown] = summarizeCoverage(bug);
      if (lines_added == 0) {
        return;
      }

      // For the purpose of the patch coverage chart, assume unknown lines are covered.
      counterObj.lines_covered += lines_covered + lines_unknown;
      counterObj.lines_added += lines_added;
    },
    null,
    (summary) => summary.creation_date
  );

  let categories = [];
  let average_patch_coverage = [];
  for (let date in summaryData) {
    if (summaryData[date].lines_added == 0) {
      continue;
    }

    categories.push(date);
    average_patch_coverage.push(
      Math.ceil(
        (100 * summaryData[date].lines_covered) / summaryData[date].lines_added
      )
    );
  }

  renderChart(
    chartEl,
    [
      {
        name: "Average patch coverage",
        data: average_patch_coverage,
      },
    ],
    categories,
    "Average patch coverage",
    "# of lines covered / # of lines added",
    {
      tickAmount: 10,
      min: 0,
      max: 100,
    }
  );
}

export async function renderReviewTimeChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter((bugSummary) => bugSummary.date !== null);

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      for (let commit of bug.commits) {
        if (commit.first_review_time !== null) {
          counterObj.review_times.push(commit.first_review_time);
        }
      }
    },
    null,
    (summary) => summary.creation_date,
    () => []
  );

  let categories = [];
  let ninthdecile_review_times = [];
  let median_review_times = [];
  for (let date in summaryData) {
    categories.push(date);
    ninthdecile_review_times.push(
      quantile(summaryData[date].review_times, 0.9).toFixed(1)
    );
    median_review_times.push(median(summaryData[date].review_times).toFixed(1));
  }

  renderChart(
    chartEl,
    [
      {
        name: "90% time to first review",
        data: ninthdecile_review_times,
      },
      {
        name: "Median time to first review",
        data: median_review_times,
      },
    ],
    categories,
    "Time to first review",
    "Days"
  );
}

export async function renderTestFailureStatsChart(chartEl) {
  const componentsToDaysToStats = await componentTestStats;

  const components = getOption("components");

  const allTestStatsDays = [].concat
    .apply(
      [],
      Object.entries(componentsToDaysToStats)
        .filter(([component, daysToStats]) => components.includes(component))
        .map(([_, daysToStats]) => Object.entries(daysToStats))
    )
    .filter((testStatsDay) => "bugs" in testStatsDay[1]);

  const minDate = getPlainDate(
    allTestStatsDays.reduce((minTestStatsDay, testStatsDay) =>
      Temporal.PlainDate.compare(
        getPlainDate(testStatsDay[0]),
        getPlainDate(minTestStatsDay[0])
      ) < 0
        ? testStatsDay
        : minTestStatsDay
    )[0]
  );

  const summaryData = await getSummaryData(
    allTestStatsDays,
    getOption("grouping"),
    minDate,
    (counterObj, testStatsDay) => {
      counterObj.bugs += testStatsDay[1].bugs;
    },
    null,
    (testStatsDay) => testStatsDay[0]
  );

  const categories = [];
  const bugs = [];
  for (const date in summaryData) {
    categories.push(date);
    bugs.push(summaryData[date].bugs);
  }

  renderChart(
    chartEl,
    [
      {
        name: "Number of test failure bugs",
        data: bugs,
      },
    ],
    categories,
    "Evolution of the number of test failure bugs (total in the time period)",
    "# of bugs"
  );
}

export async function renderTestSkipStatsChart(chartEl) {
  const componentsToDaysToStats = await componentTestStats;

  const components = getOption("components");

  const allTestStatsDays = [].concat
    .apply(
      [],
      Object.entries(componentsToDaysToStats)
        .filter(([component, daysToStats]) => components.includes(component))
        .map(([_, daysToStats]) => Object.entries(daysToStats))
    )
    .filter((testStatsDay) => "skips" in testStatsDay[1]);

  const minDate = getPlainDate(
    allTestStatsDays.reduce((minTestStatsDay, testStatsDay) =>
      Temporal.PlainDate.compare(
        getPlainDate(testStatsDay[0]),
        getPlainDate(minTestStatsDay[0])
      ) < 0
        ? testStatsDay
        : minTestStatsDay
    )[0]
  );

  const days = new Set();

  const summaryData = await getSummaryData(
    allTestStatsDays,
    getOption("grouping"),
    minDate,
    (counterObj, testStatsDay) => {
      counterObj.skips += testStatsDay[1].skips;
      if (!days.has(testStatsDay[0])) {
        counterObj.days += 1;
        days.add(testStatsDay[0]);
      }
    },
    null,
    (testStatsDay) => testStatsDay[0]
  );

  const categories = [];
  const skips = [];
  for (const date in summaryData) {
    categories.push(date);
    skips.push(Math.ceil(summaryData[date].skips / summaryData[date].days));
  }

  renderChart(
    chartEl,
    [
      {
        name: "Number of tests with skip-if conditions",
        data: skips,
      },
    ],
    categories,
    "Evolution of the number of tests with skip-if conditions (average by day)",
    "# of tests"
  );
}

export async function renderTreemap(
  chartEl,
  title,
  counter,
  minimumCount = 5,
  events = {}
) {
  let data = Object.entries(counter)
    .filter(([name, count]) => count > minimumCount)
    .map(([name, count]) => {
      return { x: name, y: count };
    });

  let options = {
    series: [
      {
        data: data,
      },
    ],
    legend: {
      show: false,
    },
    chart: {
      type: "treemap",
      animations: {
        enabled: false,
      },
      events: events,
    },
    title: {
      text: title,
    },
  };

  let chart = new ApexCharts(chartEl, options);
  chart.render();
}

export async function renderDependencyHeatmap(
  chartEl,
  title,
  source_components = null,
  target_components = null
) {
  if (!source_components) {
    source_components = allComponents;
  }

  if (!target_components) {
    target_components = allComponents;
  }

  const dependencyType = getOption("dependencyType");
  const map = await getComponentDependencyMap(dependencyType);

  target_components = target_components.filter(
    (target_component) => target_component in map
  );
  source_components = source_components.filter((source_component) =>
    target_components.some(
      (target_component) => source_component in map[target_component]
    )
  );

  const series = target_components.map((target_component) => {
    let values = {};
    values.name = target_component;
    values.data = [];

    for (const source_component of source_components) {
      const obj = {};
      obj.x = source_component;
      obj.y =
        source_component in map[target_component]
          ? Math.trunc(map[target_component][source_component] * 100)
          : 0;

      values.data.push(obj);
    }

    return values;
  });

  const options = {
    series,
    chart: {
      height: 700,
      type: "heatmap",
      animations: {
        enabled: false,
      },
    },
    dataLabels: {
      enabled: false,
    },
    colors: ["#008FFB"],
    xaxis: {
      type: "category",
    },
    title: {
      text: title,
      align: "left",
    },
    tooltip: {
      custom: function ({ series, seriesIndex, dataPointIndex, w }) {
        const source = source_components[dataPointIndex];
        const target = target_components[seriesIndex];
        const perc = series[seriesIndex][dataPointIndex];

        let text;
        if (dependencyType == "regressions") {
          text = `Regressions caused by changes to <b>${source}</b> files are filed in <b>${target}</b> ${perc}% of the times.`;
        } else if (dependencyType == "test-failures") {
          text = `Failures caused by changes fixing <b>${source}</b> bugs are in tests belonging to <b>${target}</b> ${perc}% of the times.`;
        }

        return (
          `<div class="apexcharts-tooltip-text" style="font-family: Helvetica, Arial, sans-serif; font-size: 12px;">` +
          `<span class="apexcharts-tooltip-text-label">${text}</span>` +
          `</div>`
        );
      },
    },
  };

  const chart = new ApexCharts(chartEl, options);
  chart.render();
}

export function summarizeCoverage(bugSummary) {
  let lines_added = 0;
  let lines_covered = 0;
  let lines_unknown = 0;
  for (let commit of bugSummary.commits) {
    if (commit["coverage"]) {
      lines_added += commit["coverage"][0];
      lines_covered += commit["coverage"][1];
      lines_unknown += commit["coverage"][2];
    }
  }

  return [lines_added, lines_covered, lines_unknown];
}

export async function getComponentDependencyMap(type, threshold = 0.05) {
  let connections = await componentConnections;

  let key;
  if (type == "regressions") {
    // most_common_regression_components represents: changes to files in component SOURCE, that are touched when fixing bugs in component SOURCE, cause regressions in component TARGET X% of the times.
    key = "most_common_regression_components";
  } else if (type == "test-failures") {
    // most_common_test_failure_components represents: changes to fix bugs in component SOURCE cause test failures in component TARGET X% of the time.
    key = "most_common_test_failure_components";
  } else {
    throw new Error(`Unexpected dependency map type: ${type}`);
  }

  // Return an object with each component and the components that are most likely
  // to cause regressions or test failures to that component.
  let connectionsMap = {};
  for (const c of connections) {
    for (const target_component in c[key]) {
      // Ignore < N%
      if (c[key][target_component] < threshold) {
        continue;
      }

      if (!connectionsMap[target_component]) {
        connectionsMap[target_component] = {};
      }

      const source_component = c.component;
      connectionsMap[target_component][source_component] =
        c[key][target_component];
    }
  }

  return connectionsMap;
}

let options = {
  metaBugID: {
    value: null,
    type: "text",
    callback: null,
  },
  testingTags: {
    value: null,
    type: "select",
    callback: null,
  },
  fixStartDate: {
    value: null,
    type: "text",
    callback: null,
  },
  fixEndDate: {
    value: null,
    type: "text",
    callback: null,
  },
  createStartDate: {
    value: null,
    type: "text",
    callback: null,
  },
  createEndDate: {
    value: null,
    type: "text",
    callback: null,
  },
  whiteBoard: {
    value: null,
    type: "text",
    callback: null,
  },
  products: {
    value: null,
    type: "select",
    callback: null,
  },
  teams: {
    value: null,
    type: "select",
    callback: null,
  },
  components: {
    value: null,
    type: "select",
    callback: null,
  },
  grouping: {
    value: null,
    type: "radio",
    callback: null,
  },
  releaseVersions: {
    value: null,
    type: "select",
    callback: null,
  },
  includeUnfixed: {
    value: null,
    type: "checkbox",
    callback: null,
  },
  types: {
    value: null,
    type: "select",
    callback: null,
  },
  severities: {
    value: null,
    type: "select",
    callback: null,
  },
  riskiness: {
    value: null,
    type: "select",
    callback: null,
  },
  changeGrouping: {
    value: null,
    type: "select",
    callback: null,
  },
  dependencyType: {
    value: null,
    type: "radio",
    callback: null,
  },
};

export function getOption(name) {
  return options[name].value;
}

function getOptionType(name) {
  return options[name].type;
}

export async function setOption(name, value, updateURL = true) {
  if (updateURL) {
    const url = new URL(location.href);

    url.searchParams.delete(name);

    if (Array.isArray(value)) {
      for (const elem of value) {
        url.searchParams.append(name, elem);
      }
    } else if (typeof value === "boolean") {
      url.searchParams.set(name, value ? "1" : "0");
    } else {
      url.searchParams.set(name, value);
    }

    history.replaceState({}, document.title, url.href);
  }

  options[name].value = value;
  if (options[name].callback) {
    const dependentElementId = await options[name].callback();
    if (dependentElementId) {
      const dependentElement = document.getElementById(dependentElementId);
      const event = new Event("change");
      dependentElement.dispatchEvent(event);
      return true;
    }
  }
}

async function buildMetabugsDropdown(callback) {
  let metabugsDropdown = document.getElementById("featureMetabugs");
  if (!metabugsDropdown) {
    return;
  }

  metabugsDropdown.addEventListener("change", async () => {
    const value = metabugsDropdown.value;
    const metaBugID = document.getElementById("metaBugID");
    metaBugID.value = value;
    const event = new Event("change");
    metaBugID.dispatchEvent(event);
  });
  let bugs = await featureMetabugs;
  for (let bug of bugs) {
    let option = document.createElement("option");
    option.setAttribute("value", bug.id);
    option.textContent = bug.summary;
    metabugsDropdown.append(option);
  }
}

async function buildProductsSelect() {
  const productsSelect = document.getElementById("products");
  if (!productsSelect) {
    return;
  }

  const data = await landingsData;

  const allProducts = new Set();
  for (const landings of Object.values(data)) {
    for (const landing of landings) {
      allProducts.add(
        landing["component"].substr(0, landing["component"].indexOf("::"))
      );
    }
  }

  const products = [...allProducts];
  products.sort();

  for (const product of products) {
    const option = document.createElement("option");
    option.setAttribute("value", product);
    option.textContent = product;
    option.selected = true;
    productsSelect.append(option);
  }
}

export let allComponents;

async function buildComponentsSelect(teams = null) {
  let componentSelect = document.getElementById("components");
  if (!componentSelect) {
    return;
  }

  componentSelect.textContent = "";

  let data = await landingsData;

  let allComponentsSet = new Set();
  let componentsSet = new Set();
  for (let landings of Object.values(data)) {
    for (let landing of landings) {
      allComponentsSet.add(landing["component"]);

      if (teams && !teams.has(landing["team"])) {
        continue;
      }

      componentsSet.add(landing["component"]);
    }
  }

  allComponents = [...allComponentsSet];

  let components = [...componentsSet];
  components.sort();

  for (let component of components) {
    let option = document.createElement("option");
    option.setAttribute("value", component);
    option.textContent = component;
    option.selected = true;
    componentSelect.append(option);
  }
  options["products"].callback = async function () { 
    await buildProductsSelect(new Set(getOption("products"))); 
    return "components"; 
  }; 
}

async function buildTeamsSelect() {
  let teamsSelect = document.getElementById("teams");
  if (!teamsSelect) {
    return;
  }

  let data = await landingsData;

  let allTeams = new Set();
  for (let landings of Object.values(data)) {
    for (let landing of landings) {
      allTeams.add(landing["team"]);
    }
  }

  let teams = [...allTeams];
  teams.sort();

  for (let team of teams) {
    let option = document.createElement("option");
    option.setAttribute("value", team);
    option.textContent = team;
    option.selected = true;
    teamsSelect.append(option);
  }

  options["teams"].callback = async function () {
    await buildComponentsSelect(new Set(getOption("teams")));
    return "components";
  };
}

async function populateVersions() {
  var versionSelector = document.getElementById("releaseVersions");
  if (!versionSelector) {
    return;
  }

  let data = await landingsData;

  var allVersions = new Set();
  for (let bugs of Object.values(data)) {
    bugs.forEach((item) => {
      if (item.versions.length) {
        allVersions.add(...item.versions);
      }
    });
  }
  var versions = [...allVersions];
  versions.sort();

  for (let version of versions) {
    let el = document.createElement("option");
    el.setAttribute("value", version);
    el.textContent = version;
    el.selected = false;
    versionSelector.prepend(el);
  }

  // For now, previous three releases by default:
  versionSelector.firstChild.selected = true;
  versionSelector.firstChild.nextSibling.selected = true;
  versionSelector.firstChild.nextSibling.nextSibling.selected = true;
}

export let allBugTypes;

async function buildTypesSelect() {
  let typesSelect = document.getElementById("types");
  if (!typesSelect) {
    return;
  }

  let data = await landingsData;

  let types = new Set();
  for (let landings of Object.values(data)) {
    for (let landing of landings) {
      if (landing.types.length) {
        types.add(...landing.types);
      }
    }
  }

  types.add("unknown");

  allBugTypes = [...types];

  for (let type of allBugTypes) {
    let option = document.createElement("option");
    option.setAttribute("value", type);
    option.textContent = type;
    option.selected = true;
    typesSelect.append(option);
  }
}

async function buildSeveritiesSelect() {
  let severitiesSelect = document.getElementById("severities");
  if (!severitiesSelect) {
    return;
  }

  let data = await landingsData;

  let allSeverities = new Set();
  for (let landings of Object.values(data)) {
    for (let landing of landings) {
      allSeverities.add(landing.severity);
    }
  }

  let severities = [...allSeverities];

  for (let type of severities) {
    let option = document.createElement("option");
    option.setAttribute("value", type);
    option.textContent = type;
    option.selected = true;
    severitiesSelect.append(option);
  }
}

let sortBy = ["Date", "DESC"];

function setTableHeaderHandlers(callback) {
  const table = document.getElementById("table");
  if (!table) {
    return;
  }

  const elems = table.querySelectorAll("th");
  for (let elem of elems) {
    elem.onclick = async function () {
      if (sortBy[0] == elem.textContent) {
        if (sortBy[1] == "DESC") {
          sortBy[1] = "ASC";
        } else if (sortBy[1] == "ASC") {
          sortBy[1] = "DESC";
        }
      } else {
        sortBy[0] = elem.textContent;
        sortBy[1] = "DESC";
      }
      await callback(false);
    };
  }
}

async function setTableToggleHandler(callback) {
  let bugDetails = document.getElementById("bug-details");
  if (!bugDetails) {
    return;
  }

  let toggle = await localForage.getItem("detailsToggle");
  if (toggle) {
    bugDetails.open = true;
  }
  bugDetails.addEventListener("toggle", async () => {
    await localForage.setItem("detailsToggle", bugDetails.open);
    await callback(false);
  });
}

export async function setupOptions(callback) {
  await buildMetabugsDropdown(callback);
  await buildProductsSelect();
  await buildTeamsSelect();
  await buildComponentsSelect();
  await populateVersions();
  await buildTypesSelect();
  await buildSeveritiesSelect();
  setTableHeaderHandlers(callback);
  await setTableToggleHandler(callback);

  const url = new URL(location.href);

  for (const optionName in options) {
    let optionType = getOptionType(optionName);
    let elem = document.getElementById(optionName);
    if (!elem) {
      continue;
    }

    let queryValues = url.searchParams.getAll(optionName);

    if (optionType === "text") {
      if (queryValues.length != 0) {
        elem.value = queryValues[0];
      }

      await setOption(optionName, elem.value, false);

      elem.addEventListener("change", async function () {
        if (!(await setOption(optionName, elem.value))) {
          await callback();
        }
      });
    } else if (optionType === "checkbox") {
      if (queryValues.length != 0) {
        elem.checked = queryValues[0] != "0" && queryValues[0] != "false";
      }

      await setOption(optionName, elem.checked, false);

      elem.onchange = async function () {
        if (!(await setOption(optionName, elem.checked))) {
          await callback();
        }
      };
    } else if (optionType === "select") {
      if (queryValues.length != 0) {
        for (const option of elem.options) {
          option.selected = queryValues.includes(option.value);
        }
      }

      let value = [];
      for (let option of elem.options) {
        if (option.selected) {
          value.push(option.value);
        }
      }

      await setOption(optionName, value, false);

      elem.onchange = async function () {
        let value = [];
        for (let option of elem.options) {
          if (option.selected) {
            value.push(option.value);
          }
        }

        if (!(await setOption(optionName, value))) {
          await callback();
        }
      };
    } else if (optionType === "radio") {
      if (queryValues.length != 0) {
        for (const radio of document.querySelectorAll(
          `input[name=${optionName}]`
        )) {
          radio.checked = radio.value == queryValues[0];
        }
      }

      for (const radio of document.querySelectorAll(
        `input[name=${optionName}]`
      )) {
        if (radio.checked) {
          await setOption(optionName, radio.value, false);
        }
      }

      elem.onchange = async function () {
        let waitDependent = false;

        for (const radio of document.querySelectorAll(
          `input[name=${optionName}]`
        )) {
          if (radio.checked) {
            waitDependent |= await setOption(optionName, radio.value);
          }
        }

        if (!waitDependent) {
          await callback();
        }
      };
    } else {
      throw new Error("Unexpected option type.");
    }
  }
}

export async function getFilteredBugSummaries() {
  let data = await landingsData;
  let metaBugID = getOption("metaBugID");
  let testingTags = getOption("testingTags");
  let products = getOption("products");
  let components = getOption("components");
  let teams = getOption("teams");
  let whiteBoard = getOption("whiteBoard");
  let releaseVersions = getOption("releaseVersions");
  let types = getOption("types");
  let severities = getOption("severities");
  let riskiness = getOption("riskiness");

  let bugSummaries = [].concat.apply([], Object.values(data));
  if (metaBugID) {
    bugSummaries = bugSummaries.filter((bugSummary) =>
      bugSummary["meta_ids"].includes(Number(metaBugID))
    );
  }

  let fixStartDate = getOption("fixStartDate");
  if (fixStartDate) {
    fixStartDate = Temporal.PlainDate.from(fixStartDate);
    bugSummaries = bugSummaries.filter((bugSummary) => {
      if (!bugSummary.date) {
        return false;
      }

      return (
        Temporal.PlainDate.compare(
          getPlainDate(bugSummary.date),
          fixStartDate
        ) >= 0
      );
    });
  }

  let fixEndDate = getOption("fixEndDate");
  if (fixEndDate) {
    fixEndDate = Temporal.PlainDate.from(fixEndDate);
    bugSummaries = bugSummaries.filter((bugSummary) => {
      if (!bugSummary.date) {
        return false;
      }

      return (
        Temporal.PlainDate.compare(getPlainDate(bugSummary.date), fixEndDate) <=
        0
      );
    });
  }

  let createStartDate = getOption("createStartDate");
  if (createStartDate) {
    createStartDate = Temporal.PlainDate.from(createStartDate);
    bugSummaries = bugSummaries.filter(
      (bugSummary) =>
        Temporal.PlainDate.compare(
          getPlainDate(bugSummary.creation_date),
          createStartDate
        ) >= 0
    );
  }

  let createEndDate = getOption("createEndDate");
  if (createEndDate) {
    createEndDate = Temporal.PlainDate.from(createEndDate);
    bugSummaries = bugSummaries.filter(
      (bugSummary) =>
        Temporal.PlainDate.compare(
          getPlainDate(bugSummary.creation_date),
          createEndDate
        ) <= 0
    );
  }

  if (testingTags) {
    const includeUnknownTestingTags = testingTags.includes("unknown");
    const includeNotAvailableTestingTags = testingTags.includes("N/A");
    bugSummaries = bugSummaries.filter(
      (bugSummary) =>
        (includeNotAvailableTestingTags && bugSummary.commits.length == 0) ||
        bugSummary.commits.some(
          (commit) =>
            (includeUnknownTestingTags && !commit.testing) ||
            testingTags.includes(commit.testing)
        )
    );
  }

  if (products) {
    bugSummaries = bugSummaries.filter((bugSummary) =>
      products.some((product) =>
        bugSummary["component"].startsWith(`${product}::`)
      )
    );
  }

  if (components) {
    bugSummaries = bugSummaries.filter((bugSummary) =>
      components.includes(bugSummary["component"])
    );
  }

  if (teams) {
    bugSummaries = bugSummaries.filter((bugSummary) =>
      teams.includes(bugSummary["team"])
    );
  }

  if (whiteBoard) {
    bugSummaries = bugSummaries.filter((bugSummary) =>
      bugSummary["whiteboard"].includes(whiteBoard)
    );
  }

  if (releaseVersions) {
    const includeUnfixed = getOption("includeUnfixed");
    bugSummaries = bugSummaries.filter(
      (bugSummary) =>
        (includeUnfixed && bugSummary.versions.length == 0) ||
        releaseVersions.some((version) =>
          bugSummary.versions.includes(Number(version))
        )
    );
  }

  if (types) {
    if (!types.includes("unknown")) {
      bugSummaries = bugSummaries.filter((bugSummary) =>
        bugSummary.types.some((type) => types.includes(type))
      );
    }
  }

  if (severities) {
    bugSummaries = bugSummaries.filter((bugSummary) =>
      severities.includes(bugSummary.severity)
    );
  }

  if (riskiness) {
    const includeNotAvailableRiskiness = riskiness.includes("N/A");
    bugSummaries = bugSummaries.filter(
      (bugSummary) =>
        (includeNotAvailableRiskiness && bugSummary.risk_band === null) ||
        riskiness.includes(bugSummary.risk_band)
    );
  }

  let bugDetails = document.getElementById("bug-details");
  if (bugDetails) {
    let sortFunction = null;
    if (sortBy[0] == "Date") {
      sortFunction = function (a, b) {
        return Temporal.PlainDate.compare(
          getPlainDate(a.date ? a.date : a.creation_date),
          getPlainDate(b.date ? b.date : b.creation_date)
        );
      };
    } else if (sortBy[0] == "Riskiness") {
      sortFunction = function (a, b) {
        if (a.risk_band == b.risk_band) {
          return 0;
        } else if (
          a.risk_band == "h" ||
          (a.risk_band == "a" && b.risk_band == "l")
        ) {
          return 1;
        } else {
          return -1;
        }
      };
    } else if (sortBy[0] == "Bug") {
      sortFunction = function (a, b) {
        return a.id - b.id;
      };
    } else if (sortBy[0] == "Coverage") {
      sortFunction = function (a, b) {
        let [
          lines_added_a,
          lines_covered_a,
          lines_unknown_a,
        ] = summarizeCoverage(a);
        let [
          lines_added_b,
          lines_covered_b,
          lines_unknown_b,
        ] = summarizeCoverage(b);

        let uncovered_a = lines_added_a - (lines_covered_a + lines_unknown_a);
        let uncovered_b = lines_added_b - (lines_covered_b + lines_unknown_b);

        if (uncovered_a == uncovered_b) {
          return lines_added_a - lines_added_b;
        }

        return uncovered_a - uncovered_b;
      };
    }

    if (sortFunction) {
      if (sortBy[1] == "DESC") {
        bugSummaries.sort((a, b) => -sortFunction(a, b));
      } else {
        bugSummaries.sort(sortFunction);
      }
    }
  }

  return bugSummaries;
}

// TODO: On click, show previous components affected by similar patches.
// TODO: On click, show previous bugs caused by similar patches.

function addRow(bugSummary) {
  let table = document.getElementById("table");

  let row = table.insertRow(table.rows.length);

  let bug_column = row.insertCell(0);
  let bug_link = document.createElement("a");
  bug_link.textContent = `Bug ${bugSummary["id"]}`;
  bug_link.href = `https://bugzilla.mozilla.org/show_bug.cgi?id=${bugSummary["id"]}`;
  bug_link.target = "_blank";
  bug_column.append(bug_link);
  bug_column.append(document.createTextNode(` - ${bugSummary["summary"]}`));

  let components_percentages = Object.entries(
    bugSummary["most_common_regression_components"]
  );
  if (components_percentages.length > 0) {
    let component_container = document.createElement("div");
    component_container.classList.add("desc-box");
    bug_column.append(component_container);
    components_percentages.sort(
      ([component1, percentage1], [component2, percentage2]) =>
        percentage2 - percentage1
    );
    component_container.append(
      document.createTextNode("Most common regression components:")
    );
    let component_list = document.createElement("ul");
    for (let [component, percentage] of components_percentages.slice(0, 3)) {
      let component_list_item = document.createElement("li");
      component_list_item.append(
        document.createTextNode(
          `${component} - ${Math.round(100 * percentage)}%`
        )
      );
      component_list.append(component_list_item);
    }
    component_container.append(component_list);
  }

  /*<hr>
          The patches have a high chance of causing regressions of type <b>crash</b> and <b>high severity</b>.
          <br><br>
          The patches could affect the <b>Search</b> and <b>Bookmarks</b> features.
          <br><br>
          Examples of previous bugs caused by similar patches:
          <ul>
            <li>Bug 1 - Can"t bookmark pages</li>
            <li>Bug 7 - Search doesn"t work anymore <span style="background-color:gold;color:yellow;">STR</span></li>
          </ul>*/

  let date_column = row.insertCell(1);
  date_column.textContent = bugSummary.date;

  let testing_tags_column = row.insertCell(2);
  testing_tags_column.classList.add("testing-tags");
  let testing_tags_list = document.createElement("ul");
  for (let commit of bugSummary.commits) {
    let testing_tags_list_item = document.createElement("li");
    if (!commit.testing) {
      testing_tags_list_item.append(document.createTextNode("unknown"));
    } else {
      testing_tags_list_item.append(
        document.createTextNode(TESTING_TAGS[commit.testing].label)
      );
    }
    testing_tags_list.append(testing_tags_list_item);
  }
  testing_tags_column.append(testing_tags_list);

  let coverage_column = row.insertCell(3);
  let [lines_added, lines_covered, lines_unknown] = summarizeCoverage(
    bugSummary
  );
  if (lines_added != 0) {
    if (lines_unknown != 0) {
      coverage_column.textContent = `${lines_covered}-${
        lines_covered + lines_unknown
      } of ${lines_added}`;
    } else {
      coverage_column.textContent = `${lines_covered} of ${lines_added}`;
    }
  } else {
    coverage_column.textContent = "";
  }

  let risk_list = document.createElement("ul");
  let risk_column = row.insertCell(4);

  let risk_text = document.createElement("span");
  risk_text.textContent = `${bugSummary.risk_band} risk`;
  if (bugSummary.risk_band == "l") {
    // Lower than average risk.
    risk_text.style.color = LOW_RISK_COLOR;
    risk_text.textContent = "Lower";
  } else if (bugSummary.risk_band == "a") {
    // Average risk.
    risk_text.style.color = MEDIUM_RISK_COLOR;
    risk_text.textContent = "Average";
  } else if (bugSummary.risk_band == "h") {
    // Higher than average risk.
    risk_text.style.color = HIGH_RISK_COLOR;
    risk_text.textContent = "Higher";
  } else if (bugSummary.risk_band == null) {
    // No risk available (there are no commits associated to the bug).
    risk_text.textContent = "N/A";
  } else {
    throw new Exception("Unknown risk band");
  }

  risk_column.append(risk_text);
}

export async function renderTable(bugSummaries) {
  let bugDetails = document.getElementById("bug-details");
  if (!bugDetails.open) {
    return;
  }

  let table = document.getElementById("table");
  while (table.rows.length > 1) {
    table.deleteRow(table.rows.length - 1);
  }
  for (let bugSummary of bugSummaries.filter((summary) => summary.date)) {
    addRow(bugSummary);
  }
}
