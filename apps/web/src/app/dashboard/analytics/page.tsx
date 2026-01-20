'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Mail, MousePointer, AlertTriangle, TrendingUp, BarChart3, Users, GitBranch } from 'lucide-react';
import { api } from '@/lib/api';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface OverviewMetric {
  value: number;
  change: number;
}

interface Overview {
  metrics: {
    emailsSent: OverviewMetric;
    openRate: OverviewMetric;
    clickRate: OverviewMetric;
    bounceRate: OverviewMetric;
  };
}

interface DailyStat {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
}

interface HourlyStat {
  hour: number;
  opens: number;
  clicks: number;
}

interface CampaignPerformance {
  id: string;
  name: string;
  sentAt: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  rates: {
    delivery: number;
    open: number;
    click: number;
    bounce: number;
  };
}

interface FlowPerformance {
  id: string;
  name: string;
  status: string;
  enrolled: number;
  active: number;
  completed: number;
  emailsSent: number;
  opens: number;
  clicks: number;
  rates: {
    completion: number;
    open: number;
    click: number;
  };
}

interface DeliverabilityData {
  sends: {
    total: number;
    delivered: number;
    bounced: number;
    complained: number;
    failed: number;
  };
  rates: {
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
    openRate: number;
    clickRate: number;
  };
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStat[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [flows, setFlows] = useState<FlowPerformance[]>([]);
  const [deliverability, setDeliverability] = useState<DeliverabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    loadData();
  }, [days]);

  async function loadData() {
    setLoading(true);
    try {
      const [overviewRes, dailyRes, hourlyRes, campaignsRes, flowsRes, delivRes] = await Promise.all([
        api.get<Overview>('/api/v1/analytics/overview', { days }),
        api.get<DailyStat[]>('/api/v1/analytics/sends/daily', { days: 7 }),
        api.get<HourlyStat[]>('/api/v1/analytics/engagement/hourly', { days }),
        api.get<CampaignPerformance[]>('/api/v1/analytics/campaigns/performance', { limit: 5 }),
        api.get<FlowPerformance[]>('/api/v1/analytics/flows/performance'),
        api.get<DeliverabilityData>('/api/v1/analytics/deliverability', { days }),
      ]);

      setOverview(overviewRes);
      setDailyStats(dailyRes || []);
      setHourlyStats(hourlyRes || []);
      setCampaigns(campaignsRes || []);
      setFlows(flowsRes || []);
      setDeliverability(delivRes);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatPercent = (num: number): string => {
    return `${num.toFixed(1)}%`;
  };

  const formatChange = (change: number, inverse: boolean = false): { text: string; type: 'positive' | 'negative' | 'neutral' } => {
    if (Math.abs(change) < 0.1) return { text: '0%', type: 'neutral' };
    const isPositive = inverse ? change < 0 : change > 0;
    return {
      text: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
      type: isPositive ? 'positive' : 'negative',
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  const overviewStats = overview ? [
    {
      name: 'Emails Sent',
      value: formatNumber(overview.metrics.emailsSent.value),
      change: formatChange(overview.metrics.emailsSent.change),
      icon: Mail,
    },
    {
      name: 'Avg. Open Rate',
      value: formatPercent(overview.metrics.openRate.value),
      change: formatChange(overview.metrics.openRate.change),
      icon: TrendingUp,
    },
    {
      name: 'Avg. Click Rate',
      value: formatPercent(overview.metrics.clickRate.value),
      change: formatChange(overview.metrics.clickRate.change),
      icon: MousePointer,
    },
    {
      name: 'Bounce Rate',
      value: formatPercent(overview.metrics.bounceRate.value),
      change: formatChange(overview.metrics.bounceRate.change, true),
      icon: AlertTriangle,
    },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Track your email marketing performance
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {overviewStats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p
                className={`text-xs ${
                  stat.change.type === 'positive'
                    ? 'text-green-600'
                    : stat.change.type === 'negative'
                    ? 'text-red-600'
                    : 'text-muted-foreground'
                }`}
              >
                {stat.change.text} from last period
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Email Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Email Performance
            </CardTitle>
            <CardDescription>Daily email metrics over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    stackId="1"
                    stroke="#8884d8"
                    fill="#8884d8"
                    name="Sent"
                  />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    stackId="2"
                    stroke="#82ca9d"
                    fill="#82ca9d"
                    name="Delivered"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hourly Engagement Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Engagement by Hour
            </CardTitle>
            <CardDescription>When your audience is most engaged</CardDescription>
          </CardHeader>
          <CardContent>
            {hourlyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(value) => `${value}:00`}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value) => `${value}:00 - ${value}:59`}
                  />
                  <Legend />
                  <Bar dataKey="opens" fill="#8884d8" name="Opens" />
                  <Bar dataKey="clicks" fill="#82ca9d" name="Clicks" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Performing Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Top Performing Campaigns
            </CardTitle>
            <CardDescription>Campaigns with highest engagement rates</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length > 0 ? (
              <div className="space-y-4">
                {campaigns.map((campaign, index) => (
                  <div
                    key={campaign.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {index + 1}
                      </span>
                      <span className="font-medium truncate max-w-[200px]">{campaign.name}</span>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Open: <span className="text-foreground">{campaign.rates.open.toFixed(1)}%</span>
                      </span>
                      <span className="text-muted-foreground">
                        Click: <span className="text-foreground">{campaign.rates.click.toFixed(1)}%</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No campaigns sent yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Flow Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Flow Performance
            </CardTitle>
            <CardDescription>Automation flow statistics</CardDescription>
          </CardHeader>
          <CardContent>
            {flows.length > 0 ? (
              <div className="space-y-4">
                {flows.map((flow) => (
                  <div
                    key={flow.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{flow.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {flow.enrolled} enrolled · {flow.active} active
                      </p>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Completion: <span className="text-foreground">{flow.rates.completion.toFixed(1)}%</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        flow.status === 'active' ? 'bg-green-100 text-green-800' :
                        flow.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {flow.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No flows created yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deliverability */}
      {deliverability && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Deliverability Overview
            </CardTitle>
            <CardDescription>Monitor your email delivery health</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-800">Total Sent</p>
                <p className="text-2xl font-bold text-blue-900">{formatNumber(deliverability.sends.total)}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">Delivered</p>
                <p className="text-2xl font-bold text-green-900">{formatPercent(deliverability.rates.deliveryRate)}</p>
              </div>
              <div className="rounded-lg bg-yellow-50 p-4">
                <p className="text-sm font-medium text-yellow-800">Open Rate</p>
                <p className="text-2xl font-bold text-yellow-900">{formatPercent(deliverability.rates.openRate)}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">Bounces</p>
                <p className="text-2xl font-bold text-red-900">{formatPercent(deliverability.rates.bounceRate)}</p>
              </div>
              <div className="rounded-lg bg-purple-50 p-4">
                <p className="text-sm font-medium text-purple-800">Complaints</p>
                <p className="text-2xl font-bold text-purple-900">{formatPercent(deliverability.rates.complaintRate)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
