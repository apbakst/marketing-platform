'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Mail, MousePointer, AlertTriangle, TrendingUp } from 'lucide-react';

const overviewStats = [
  {
    name: 'Emails Sent',
    value: '45,231',
    change: '+8.2%',
    changeType: 'positive',
    icon: Mail,
  },
  {
    name: 'Avg. Open Rate',
    value: '38.5%',
    change: '+2.1%',
    changeType: 'positive',
    icon: TrendingUp,
  },
  {
    name: 'Avg. Click Rate',
    value: '6.8%',
    change: '-0.3%',
    changeType: 'negative',
    icon: MousePointer,
  },
  {
    name: 'Bounce Rate',
    value: '1.2%',
    change: '-0.5%',
    changeType: 'positive',
    icon: AlertTriangle,
  },
];

const emailPerformance = [
  { date: 'Jan 8', sent: 1200, opened: 450, clicked: 82 },
  { date: 'Jan 9', sent: 980, opened: 380, clicked: 65 },
  { date: 'Jan 10', sent: 1500, opened: 590, clicked: 105 },
  { date: 'Jan 11', sent: 1100, opened: 420, clicked: 78 },
  { date: 'Jan 12', sent: 1350, opened: 510, clicked: 92 },
  { date: 'Jan 13', sent: 890, opened: 340, clicked: 58 },
  { date: 'Jan 14', sent: 1450, opened: 560, clicked: 98 },
];

const topCampaigns = [
  { name: 'Welcome Series - Day 1', openRate: 52, clickRate: 12.3 },
  { name: 'Product Launch', openRate: 48, clickRate: 9.8 },
  { name: 'Flash Sale Alert', openRate: 45, clickRate: 15.2 },
  { name: 'Monthly Newsletter', openRate: 38, clickRate: 5.6 },
  { name: 'Re-engagement', openRate: 32, clickRate: 4.2 },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">
          Track your email marketing performance
        </p>
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
                  stat.changeType === 'positive'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {stat.change} from last period
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Email Performance Chart Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>Email Performance</CardTitle>
            <CardDescription>Daily email metrics over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p>Chart visualization would go here</p>
                <p className="text-sm">(Using recharts library)</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {emailPerformance.map((day) => (
                <div
                  key={day.date}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{day.date}</span>
                  <div className="flex gap-4">
                    <span>Sent: {day.sent}</span>
                    <span>Opened: {day.opened}</span>
                    <span>Clicked: {day.clicked}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Performing Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Campaigns</CardTitle>
            <CardDescription>Campaigns with highest engagement rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topCampaigns.map((campaign, index) => (
                <div
                  key={campaign.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {index + 1}
                    </span>
                    <span className="font-medium">{campaign.name}</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Open: <span className="text-foreground">{campaign.openRate}%</span>
                    </span>
                    <span className="text-muted-foreground">
                      Click: <span className="text-foreground">{campaign.clickRate}%</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deliverability */}
      <Card>
        <CardHeader>
          <CardTitle>Deliverability Overview</CardTitle>
          <CardDescription>Monitor your email delivery health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">Delivered</p>
              <p className="text-2xl font-bold text-green-900">98.2%</p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <p className="text-sm font-medium text-yellow-800">Soft Bounces</p>
              <p className="text-2xl font-bold text-yellow-900">0.8%</p>
            </div>
            <div className="rounded-lg bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">Hard Bounces</p>
              <p className="text-2xl font-bold text-red-900">0.4%</p>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <p className="text-sm font-medium text-purple-800">Complaints</p>
              <p className="text-2xl font-bold text-purple-900">0.02%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
