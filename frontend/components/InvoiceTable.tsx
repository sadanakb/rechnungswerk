'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface InvoiceRow {
  invoice_id: string
  invoice_number: string
  created_at: string
  buyer_name: string
  gross_amount: number
  status?: string
  payment_status?: string
}

export interface InvoiceTableProps {
  invoices: InvoiceRow[]
  loading: boolean
  /** Called with the list of selected invoice_ids whenever the selection changes */
  onSelectionChange?: (invoiceIds: string[]) => void
  /**
   * Changing this value (e.g. incrementing a counter) clears the row selection.
   * Useful when the parent wants to programmatically deselect all rows.
   */
  selectionResetKey?: number
}

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  valid: {
    label: 'Validiert',
    className:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  invalid: {
    label: 'Ungueltig',
    className:
      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  pending: {
    label: 'Ausstehend',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  draft: {
    label: 'Entwurf',
    className:
      'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  },
  xrechnung_generated: {
    label: 'XML erstellt',
    className:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  ocr_processed: {
    label: 'OCR',
    className:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  error: {
    label: 'Fehler',
    className:
      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
}

function StatusBadge({ status }: { status: string | undefined }) {
  const s = status ?? 'draft'
  const cfg = STATUS_CONFIG[s] ?? {
    label: s,
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap',
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Payment status badge
// ---------------------------------------------------------------------------
const PAYMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unpaid: {
    label: 'Offen',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  },
  paid: {
    label: 'Bezahlt',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  partial: {
    label: 'Teilw.',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  overdue: {
    label: 'Ueberfaellig',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  cancelled: {
    label: 'Storniert',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400',
  },
}

function PaymentBadge({ status }: { status: string | undefined }) {
  const s = status ?? 'unpaid'
  const cfg = PAYMENT_STATUS_CONFIG[s] ?? {
    label: s,
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap',
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatEuro(amount: number | null | undefined): string {
  if (amount == null) return '--'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

// ---------------------------------------------------------------------------
// Skeleton Row
// ---------------------------------------------------------------------------
function SkeletonRow() {
  return (
    <tr data-testid="skeleton-row" className="border-b" style={{ borderColor: 'rgb(var(--border))' }}>
      <td className="px-4 py-3 w-10">
        <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </td>
      <td className="px-3 py-3">
        <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </td>
      <td className="px-3 py-3">
        <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </td>
      <td className="px-3 py-3">
        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse ml-auto" />
      </td>
      <td className="px-3 py-3">
        <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------
function createColumns(): ColumnDef<InvoiceRow>[] {
  return [
    // Selection checkbox
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-[rgb(var(--primary))]"
          aria-label="Alle auswaehlen"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-[rgb(var(--primary))]"
          aria-label={`Zeile ${row.original.invoice_number} auswaehlen`}
        />
      ),
      enableSorting: false,
      size: 40,
    },
    // Rechnungsnr.
    {
      accessorKey: 'invoice_number',
      header: 'Rechnungsnr.',
      cell: ({ getValue }) => (
        <span className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
          {(getValue() as string) || '--'}
        </span>
      ),
    },
    // Datum
    {
      accessorKey: 'created_at',
      header: 'Datum',
      cell: ({ getValue }) => (
        <span className="text-sm whitespace-nowrap" style={{ color: 'rgb(var(--foreground-muted))' }}>
          {formatDate(getValue() as string)}
        </span>
      ),
      sortingFn: 'datetime',
    },
    // Empfaenger
    {
      accessorKey: 'buyer_name',
      header: 'Empfaenger',
      cell: ({ getValue }) => (
        <span
          className="text-sm truncate block max-w-[200px]"
          style={{ color: 'rgb(var(--foreground))' }}
          title={getValue() as string}
        >
          {(getValue() as string) || '--'}
        </span>
      ),
    },
    // Betrag
    {
      accessorKey: 'gross_amount',
      header: 'Betrag',
      cell: ({ getValue }) => (
        <span
          className="text-sm font-semibold tabular-nums whitespace-nowrap"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          {formatEuro(getValue() as number)}
        </span>
      ),
      sortingFn: 'basic',
    },
    // Status
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <StatusBadge status={getValue() as string | undefined} />,
      enableSorting: true,
    },
    // Zahlungsstatus
    {
      accessorKey: 'payment_status',
      header: 'Zahlung',
      cell: ({ getValue }) => <PaymentBadge status={getValue() as string | undefined} />,
      enableSorting: true,
    },
  ]
}

// ---------------------------------------------------------------------------
// InvoiceTable Component
// ---------------------------------------------------------------------------
export function InvoiceTable({ invoices, loading, onSelectionChange, selectionResetKey }: InvoiceTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // Reset selection whenever the parent signals it
  useEffect(() => {
    if (selectionResetKey !== undefined) {
      setRowSelection({})
    }
  }, [selectionResetKey])

  const columns = useMemo(() => createColumns(), [])

  const table = useReactTable({
    data: invoices,
    columns,
    state: {
      sorting,
      globalFilter,
      rowSelection,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    getRowId: (row) => row.invoice_id,
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  })

  const selectedCount = Object.keys(rowSelection).length

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(Object.keys(rowSelection))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection])

  // --- Loading state ---
  if (loading) {
    return (
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <table className="w-full">
          <thead>
            <tr
              className="border-b"
              style={{
                backgroundColor: 'rgb(var(--muted))',
                borderColor: 'rgb(var(--border))',
              }}
            >
              <th className="px-4 py-3 w-10" />
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Rechnungsnr.
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Datum
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Empfaenger
              </th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Betrag
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Status
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Zahlung
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* --- Search + Bulk info --- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Global search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          />
          <input
            type="text"
            placeholder="Suchen nach Nummer, Empfaenger..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'rgb(var(--input))',
              borderColor: 'rgb(var(--input-border))',
              color: 'rgb(var(--foreground))',
            }}
          />
        </div>

        {/* Selected count */}
        {selectedCount > 0 && (
          <span
            className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{
              backgroundColor: 'rgb(var(--primary-light))',
              color: 'rgb(var(--primary))',
            }}
          >
            {selectedCount} ausgewaehlt
          </span>
        )}
      </div>

      {/* --- Table --- */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b"
                  style={{
                    backgroundColor: 'rgb(var(--muted))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  {headerGroup.headers.map((header) => {
                    const isSortable = header.column.getCanSort()
                    const sortDir = header.column.getIsSorted()
                    const isAmount = header.column.id === 'gross_amount'

                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'px-3 py-3',
                          isAmount ? 'text-right' : 'text-left',
                          header.column.id === 'select' && 'w-10 px-4',
                        )}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      >
                        {header.isPlaceholder ? null : isSortable ? (
                          <button
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn(
                              'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:opacity-80',
                              isAmount && 'ml-auto',
                            )}
                            style={{
                              color: sortDir
                                ? 'rgb(var(--primary))'
                                : 'rgb(var(--foreground-muted))',
                            }}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {sortDir === 'asc' ? (
                              <ChevronUp size={12} />
                            ) : sortDir === 'desc' ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronsUpDown size={12} className="opacity-30" />
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="text-center py-12"
                  >
                    <FileText
                      size={40}
                      className="mx-auto mb-3"
                      style={{ color: 'rgb(var(--border))' }}
                    />
                    <p
                      className="font-medium text-sm mb-1"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      Keine Rechnungen vorhanden
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Erstellen Sie Ihre erste Rechnung per OCR Upload oder manueller Eingabe.
                    </p>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b last:border-b-0 transition-colors duration-100',
                    )}
                    style={{
                      borderColor: 'rgb(var(--border))',
                      backgroundColor: row.getIsSelected()
                        ? 'rgb(var(--primary-light))'
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!row.getIsSelected()) {
                        e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!row.getIsSelected()) {
                        e.currentTarget.style.backgroundColor = ''
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-3 py-3',
                          cell.column.id === 'gross_amount' && 'text-right',
                          cell.column.id === 'select' && 'w-10 px-4',
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* --- Pagination --- */}
        {table.getPageCount() > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: 'rgb(var(--border))' }}
          >
            <div className="flex items-center gap-3">
              <p
                className="text-xs"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Seite {table.getState().pagination.pageIndex + 1} von{' '}
                {table.getPageCount()} &middot;{' '}
                {table.getFilteredRowModel().rows.length} Rechnungen
              </p>
              {/* Page size selector */}
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="text-xs rounded border px-2 py-1"
                style={{
                  backgroundColor: 'rgb(var(--input))',
                  borderColor: 'rgb(var(--input-border))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} pro Seite
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="w-8 h-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-30"
                style={{ color: 'rgb(var(--foreground-muted))' }}
                title="Vorherige Seite"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Page number buttons */}
              {(() => {
                const currentPage = table.getState().pagination.pageIndex
                const pageCount = table.getPageCount()
                const maxButtons = Math.min(5, pageCount)
                let start: number
                if (pageCount <= 5) {
                  start = 0
                } else if (currentPage <= 2) {
                  start = 0
                } else if (currentPage >= pageCount - 3) {
                  start = pageCount - 5
                } else {
                  start = currentPage - 2
                }
                return Array.from({ length: maxButtons }, (_, i) => {
                  const pageIdx = start + i
                  return (
                    <button
                      key={pageIdx}
                      onClick={() => table.setPageIndex(pageIdx)}
                      className="w-8 h-8 rounded-md text-xs font-medium flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor:
                          currentPage === pageIdx
                            ? 'rgb(var(--primary))'
                            : 'transparent',
                        color:
                          currentPage === pageIdx
                            ? 'white'
                            : 'rgb(var(--foreground-muted))',
                      }}
                    >
                      {pageIdx + 1}
                    </button>
                  )
                })
              })()}

              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="w-8 h-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-30"
                style={{ color: 'rgb(var(--foreground-muted))' }}
                title="Naechste Seite"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
