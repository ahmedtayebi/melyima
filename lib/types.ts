export interface Category {
  id: string
  name: string
  sort_order: number
  is_visible: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  price: number
  original_price: number
  description: string | null
  is_visible: boolean
  category_id: string | null
  sales_count: number
  created_at: string
  updated_at: string
  product_colors?: ProductColor[]
  product_sizes?: ProductSize[]
  product_variants?: ProductVariant[]
}

export interface ProductColorImage {
  id: string
  color_id: string
  image_url: string
  sort_order: number
}

export interface ProductColor {
  id: string
  product_id: string
  name: string
  hex_code: string
  image_url: string | null
  is_visible: boolean
  images?: ProductColorImage[]
}

export interface ProductSize {
  id: string
  product_id: string
  label: string
  is_visible: boolean
  sort_order: number
}

export interface ProductVariant {
  id: string
  product_id: string
  color_id: string
  size_id: string
  stock: number
}

export interface Order {
  id: string
  customer_name: string
  phone: string
  phone2: string | null
  wilaya: string
  wilaya_name: string | null
  commune: string | null
  delivery_type: 'home' | 'office'
  delivery_price: number
  products_total: number
  total_price: number
  address: string | null
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
  order_items?: OrderItem[]
  ecotrack_tracking?: string | null
  ecotrack_status?: 'none' | 'draft' | 'shipped' | null
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  color_name: string
  color_hex: string
  color_image_url: string | null
  size_label: string
  quantity: number
}

export interface Review {
  id: string
  customer_name: string
  rating: number
  comment: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  images?: string[]
}

export interface StoreSettings {
  key: string
  value: string
}

export interface CartItem {
  product_id: string
  product_name: string
  color_id: string
  color_name: string
  color_hex: string
  color_image_url: string | null
  size_id: string
  size_label: string
  quantity: number
  price: number
}
