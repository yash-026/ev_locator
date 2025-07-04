'use client'

import { useState, useEffect, useLayoutEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import dynamic from 'next/dynamic'
import { io, Socket } from 'socket.io-client'
import toast from 'react-hot-toast'
import { MapPin, Zap, Users } from 'lucide-react'

const MapComponent = dynamic(() => import('./components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center">
      Loading map...
    </div>
  ),
})

interface Station {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
  total_slots: number
  available_slots: number
  occupied_slots?: number
  charging_types: string[]
  price_per_hour: number
  amenities: string[]
  status: string
  avg_power?: number
}

export default function HomePage() {
  const { user, isLoaded } = useUser()
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000')
    setSocket(newSocket)

    newSocket.on('stations_update', (updatedStations: Station[]) => {
      setStations(updatedStations)
    })

    fetchStations()

    return () => {
      newSocket.close()
    }
  }, [])

  const fetchStations = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/stations`)
      const data = await response.json()
      setStations(data)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching stations:', error)
      toast.error('Failed to load charging stations')
      setLoading(false)
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <Zap className="h-8 w-8 text-green-500" />
              <h1 className="text-2xl font-bold text-gray-900">EV Charging Locator</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user?.firstName}</span>
              <a href="/bookings" className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors">
                My Bookings
              </a>
              {user?.publicMetadata?.role === 'admin' && (
                <a href="/admin" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                  Admin Panel
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-1/3 bg-white shadow-lg overflow-y-auto h-screen">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Nearby Stations</h2>
            <div className="space-y-4">
              {stations.map((station) => (
                <div
                  key={station.id}
                  className={`booking-card cursor-pointer ${selectedStation?.id === station.id ? 'ring-2 ring-green-500' : ''
                    }`}
                  onClick={() => setSelectedStation(station)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">{station.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs ${station.available_slots > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                      {station.available_slots > 0 ? 'Available' : 'Full'}
                    </span>
                  </div>

                  <div className="flex items-center text-sm text-gray-600 mb-2">
                    <MapPin className="h-4 w-4 mr-1" />
                    {station.address}
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-1" />
                      {station.available_slots}/{station.total_slots} available
                    </div>
                    <div className="font-semibold text-green-600">
                      ₹{station.price_per_hour}/hour
                    </div>
                  </div>

                  {station.avg_power && (
                    <div className="mt-2 text-xs text-blue-600">
                      Avg Power: {station.avg_power} kW
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 h-screen">
          <MapComponent
            stations={stations}
            selectedStation={selectedStation}
            onStationSelect={setSelectedStation}
          />
        </div>
      </div>
    </div>
  )
}