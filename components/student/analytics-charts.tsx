"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AssessmentPoint = {
  name: string;
  score: number | null;
  mean: number | null;
  maxScore: number;
  rawScore: number | null;
  weight: number;
};
type DistributionPoint = {
  range: string;
  count: number;
  bell: number;
  containsStudent: boolean;
};

const axisProps = {
  tick: { fill: "#94a0b5", fontSize: 11 },
  axisLine: { stroke: "#283144" },
  tickLine: false,
};

export function AssessmentComparisonChart({
  data,
}: {
  data: AssessmentPoint[];
}) {
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Student scores compared with class averages by assessment"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 8, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#283144"
            strokeDasharray="3 4"
            vertical={false}
          />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} {...axisProps} />
          <Tooltip
            cursor={{ fill: "#ffffff08" }}
            contentStyle={{
              background: "#111725",
              border: "1px solid #283144",
              borderRadius: 12,
              color: "#eef2ff",
            }}
          />
          <Bar
            dataKey="score"
            name="Your mark (% of max)"
            fill="#8b5cf6"
            radius={[5, 5, 0, 0]}
          />
          <Bar
            dataKey="mean"
            name="Class mean (% of max)"
            fill="#06b6d4"
            radius={[5, 5, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClassDistributionChart({
  data,
  mean,
}: {
  data: DistributionPoint[];
  mean: number | null;
}) {
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Distribution of projected weighted course scores in your class"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 8, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#283144"
            strokeDasharray="3 4"
            vertical={false}
          />
          <XAxis dataKey="range" {...axisProps} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip
            cursor={{ fill: "#ffffff08" }}
            contentStyle={{
              background: "#111725",
              border: "1px solid #283144",
              borderRadius: 12,
              color: "#eef2ff",
            }}
          />
          {mean != null && (
            <ReferenceLine
              x={
                data.find(
                  ({ range }, index) =>
                    mean >= Number(range.split("–")[0]) &&
                    (index === data.length - 1 ||
                      mean < Number(data[index + 1].range.split("–")[0])),
                )?.range
              }
              stroke="#06b6d4"
              strokeDasharray="4 4"
            />
          )}
          <Bar dataKey="count" name="Students" radius={[5, 5, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.range}
                fill={entry.containsStudent ? "#8b5cf6" : "#38435b"}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="bell"
            name="Bell curve estimate"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
