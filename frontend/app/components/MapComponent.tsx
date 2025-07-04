'use client'

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvent,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css';
import { useRouter } from 'next/navigation'
import { MapPin, Zap, Users } from 'lucide-react'

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
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

interface MapComponentProps {
  stations: Station[]
  selectedStation: Station | null
  onStationSelect: (station: Station) => void
}

function MapUpdater({ selectedStation }: { selectedStation: Station | null }) {
  const map = useMap()

  useEffect(() => {
    if (selectedStation) {
      map.setView([selectedStation.latitude, selectedStation.longitude], 15)
    }
  }, [selectedStation, map])

  return null
}

function MapMarkers({
  stations,
  onStationSelect,
  handleBookNow,
}: {
  stations: Station[]
  onStationSelect: (station: Station) => void
  handleBookNow: (stationId: number) => void
}) {
  const createCustomIcon = (available: number, total: number) => {
    const color =
      available === 0
        ? '#ef4444'
        : available < total / 2
          ? '#f59e0b'
          : '#10b981'

    return L.divIcon({
      html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center;">
        <div style="color: white; font-size: 10px; font-weight: bold;">${available}</div>
      </div>`,
      className: 'custom-div-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }

  return (
    <>
      {stations.map((station) => (
        <Marker
          key={station.id}
          position={[station.latitude, station.longitude]}
          icon={createCustomIcon(station.available_slots, station.total_slots)}
          eventHandlers={{
            click: () => onStationSelect(station),
          }}
        >
          <Popup className="station-popup">
            <div className="w-64 p-4">
              <h3 className="font-bold text-lg mb-2">{station.name}</h3>

              <div className="flex items-center text-sm text-gray-600 mb-2">
                <MapPin className="h-4 w-4 mr-1" />
                {station.address}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {station.available_slots}/{station.total_slots} available
                </div>
                <div className="flex items-center">
                  <Zap className="h-4 w-4 mr-1" />
                  ₹{station.price_per_hour}/hour
                </div>
              </div>

              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">Charging Types:</div>
                <div className="flex flex-wrap gap-1">
                  {station.charging_types.map((type) => (
                    <span
                      key={type}
                      className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">Amenities:</div>
                <div className="flex flex-wrap gap-1">
                  {station.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleBookNow(station.id)}
                disabled={station.available_slots === 0}
                className={`w-full py-2 px-4 rounded-md text-sm font-medium ${station.available_slots === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
              >
                {station.available_slots === 0 ? 'Fully Booked' : 'Book Now'}
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

export default function MapComponent({
  stations,
  selectedStation,
  onStationSelect,
}: MapComponentProps) {
  const router = useRouter()

  const handleBookNow = (stationId: number) => {
    router.push(`/booking/${stationId}`)
  }

  return (
    <MapContainer
      key="main-map"
      center={[12.9716, 77.5946]}
      zoom={12}
      scrollWheelZoom={true}
      className="flex-1 h-screen"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapUpdater selectedStation={selectedStation} />
      <MapMarkers
        stations={stations}
        onStationSelect={onStationSelect}
        handleBookNow={handleBookNow}
      />
    </MapContainer>
  )
}
