import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
  Ref,
  RefObject,
} from 'react'
import { useDataGrid } from '@/components/reui/data-grid/data-grid'
import type { DataGridFeatures, DataGridTableInstance } from '@/components/reui/data-grid/data-grid'
import { flexRender, Subscribe } from '@tanstack/react-table'
import type { Cell, Column, Header, Row } from '@tanstack/react-table'

import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

// Static spacing lookups; called once per cell, so they stay plain string
// picks instead of runtime variant machinery.
const headerCellSpacingVariants = ({ size }: { size?: 'dense' | 'default' }) =>
  size === 'dense' ? 'px-2 h-8' : 'px-3'

const bodyCellSpacingVariants = ({ size }: { size?: 'dense' | 'default' }) =>
  size === 'dense' ? 'px-2 py-1.5' : 'px-3 py-2'

function getPinningStyles<TData extends object>(
  column: Column<DataGridFeatures, TData, unknown>,
): CSSProperties {
  const isPinned = column.getIsPinned()

  return {
    // Logical offsets: TanStack's "left"/"right" buckets are start/end
    // semantics, so pinned columns stick to the correct edge in RTL too
    // (identical to left/right in LTR).
    insetInlineStart: isPinned === 'start' ? `${column.getStart('start')}px` : undefined,
    insetInlineEnd: isPinned === 'end' ? `${column.getAfter('end')}px` : undefined,
    position: isPinned ? 'sticky' : undefined,
    transform: isPinned ? 'translateZ(0)' : undefined,
    contain: isPinned ? 'paint' : undefined,
    width: column.getSize(),
    zIndex: isPinned ? 30 : undefined,
    backgroundClip: isPinned ? 'padding-box' : undefined,
  }
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return

  if ('current' in ref) {
    ref.current = value

    return
  }

  ref(value)
}

/**
 * Nearest scroll-area viewport that belongs to THIS grid. A viewport outside
 * the grid's own container (e.g. a page-level ScrollArea) would make the
 * width measurement - and the virtualizer - bind the wrong box.
 */
function getDataGridScrollAreaViewport(node: HTMLElement): HTMLElement | null {
  const scrollViewport = node.closest('[data-slot="scroll-area-viewport"]')

  if (!(scrollViewport instanceof HTMLElement)) return null

  const gridContainer = node.closest('[data-slot="data-grid"]')

  if (gridContainer && !gridContainer.contains(scrollViewport)) return null

  return scrollViewport
}

type DataGridResizeStartEvent = ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>

type DataGridResizeDocumentEvent = globalThis.MouseEvent | globalThis.TouchEvent

function isDataGridTouchEvent(
  event: DataGridResizeStartEvent | DataGridResizeDocumentEvent,
): event is ReactTouchEvent<HTMLDivElement> | globalThis.TouchEvent {
  return 'touches' in event
}

type DataGridTouchListLike = {
  length: number
  item: (index: number) => { identifier: number; clientX: number } | null
}

function findTouchClientX(list: DataGridTouchListLike, identifier: number) {
  for (let i = 0; i < list.length; i++) {
    const touch = list.item(i)

    if (touch && touch.identifier === identifier) return touch.clientX
  }

  return undefined
}

function getDataGridResizeEventClientX(
  event: DataGridResizeStartEvent | DataGridResizeDocumentEvent,
  touchIdentifier?: number,
) {
  if (isDataGridTouchEvent(event)) {
    if (touchIdentifier !== undefined) {
      return (
        findTouchClientX(event.touches, touchIdentifier) ??
        findTouchClientX(event.changedTouches, touchIdentifier)
      )
    }

    return event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX
  }

  return event.clientX
}

function startDataGridColumnResizeOnEnd<TData extends object>(
  event: DataGridResizeStartEvent,
  header: Header<DataGridFeatures, TData, unknown>,
  table: DataGridTableInstance<TData>,
): (() => void) | undefined {
  const column = table.getColumn(header.column.id)

  if (!column || !column.getCanResize()) return
  const isTouchSession = isDataGridTouchEvent(event)

  if (isTouchSession && event.touches.length > 1) return

  event.persist?.()

  const ownerDocument = event.currentTarget.ownerDocument
  const ownerWindow = ownerDocument.defaultView
  const previousBodyCursor = ownerDocument.body.style.cursor
  const previousDocumentCursor = ownerDocument.documentElement.style.cursor
  const startSize = header.getSize()
  // Track the initiating finger so a second touch cannot move or commit the
  // resize with the wrong clientX.
  const touchIdentifier = isTouchSession ? event.touches[0]?.identifier : undefined
  const dragStartClientX = getDataGridResizeEventClientX(event, touchIdentifier)
  const headerCell = event.currentTarget.closest('th')
  const headerRect = headerCell?.getBoundingClientRect()

  const startOffset =
    headerRect &&
    Number.isFinite(
      table.options.columnResizeDirection === 'rtl' ? headerRect.left : headerRect.right,
    )
      ? table.options.columnResizeDirection === 'rtl'
        ? headerRect.left
        : headerRect.right
      : dragStartClientX

  if (dragStartClientX === undefined || startOffset === undefined) {
    return
  }

  ownerDocument.body.style.cursor = 'col-resize'
  ownerDocument.documentElement.style.cursor = 'col-resize'

  const columnSizingStart = header
    .getLeafHeaders()
    .map((leafHeader): [string, number] => [leafHeader.column.id, leafHeader.column.getSize()])

  const directionMultiplier = table.options.columnResizeDirection === 'rtl' ? -1 : 1

  // Clamp the drag to the leaf columns' min/max sizes so the preview
  // indicator matches what the commit will produce (no overshoot followed by
  // a snap-back on release). columnDef always carries resolved defaults.
  let minDeltaPercentage = -0.999999
  let maxDeltaPercentage = Number.POSITIVE_INFINITY
  columnSizingStart.forEach(([columnId, headerSize]) => {
    if (headerSize <= 0) return

    const leafColumn = table.getColumn(columnId)
    const minSize = leafColumn?.columnDef.minSize
    const maxSize = leafColumn?.columnDef.maxSize

    if (minSize !== undefined) {
      minDeltaPercentage = Math.max(minDeltaPercentage, minSize / headerSize - 1)
    }

    if (maxSize !== undefined && Number.isFinite(maxSize)) {
      maxDeltaPercentage = Math.min(maxDeltaPercentage, maxSize / headerSize - 1)
    }
  })

  let lastClientX = dragStartClientX
  let ended = false
  const stopListeners: Array<() => void> = []

  const updateOffset = (clientXPos?: number, commit = false) => {
    if (clientXPos === undefined) return

    lastClientX = clientXPos

    const nextColumnSizing: Record<string, number> = {}

    const deltaPercentage = Math.min(
      Math.max(
        ((clientXPos - dragStartClientX) * directionMultiplier) / startSize,
        minDeltaPercentage,
      ),
      maxDeltaPercentage,
    )

    const deltaOffset = deltaPercentage * startSize

    columnSizingStart.forEach(([columnId, headerSize]) => {
      nextColumnSizing[columnId] =
        Math.round(Math.max(headerSize + headerSize * deltaPercentage, 0) * 100) / 100
    })

    table.setColumnResizing((old) => ({
      ...old,
      startOffset,
      startSize,
      deltaOffset,
      deltaPercentage,
      columnSizingStart,
      isResizingColumn: column.id,
    }))

    if (commit) {
      table.setColumnSizing((old) => ({
        ...old,
        ...nextColumnSizing,
      }))
    }
  }

  // Single teardown path: commits at the given position, removes every
  // document/window listener, and restores cursors. Safe to call more than
  // once (blur + mouseup + unmount can race).
  const endResize = (clientXPos?: number) => {
    if (ended) return
    ended = true

    stopListeners.forEach((stop) => stop())
    updateOffset(clientXPos, true)
    table.setColumnResizing((old) => ({
      ...old,
      isResizingColumn: false,
      startOffset: null,
      startSize: null,
      deltaOffset: null,
      deltaPercentage: null,
      columnSizingStart: [],
    }))
    ownerDocument.body.style.cursor = previousBodyCursor
    ownerDocument.documentElement.style.cursor = previousDocumentCursor
  }

  const mouseMoveHandler = (moveEvent: globalThis.MouseEvent) => {
    updateOffset(moveEvent.clientX)
  }

  const mouseUpHandler = (upEvent: globalThis.MouseEvent) => {
    endResize(upEvent.clientX)
  }

  const touchMoveHandler = (moveEvent: globalThis.TouchEvent) => {
    if (moveEvent.cancelable) {
      moveEvent.preventDefault()
      moveEvent.stopPropagation()
    }

    updateOffset(getDataGridResizeEventClientX(moveEvent, touchIdentifier))
  }

  const touchEndHandler = (endEvent: globalThis.TouchEvent) => {
    // Ignore other fingers lifting; only the initiating touch ends the drag.
    const clientXPos =
      touchIdentifier !== undefined
        ? findTouchClientX(endEvent.changedTouches, touchIdentifier)
        : getDataGridResizeEventClientX(endEvent)

    if (clientXPos === undefined) return

    if (endEvent.cancelable) {
      endEvent.preventDefault()
      endEvent.stopPropagation()
    }

    endResize(clientXPos)
  }

  // System-interrupted gestures and window focus loss would otherwise leave
  // the session (and its document listeners) live with no pointer held.
  const touchCancelHandler = () => {
    endResize(lastClientX)
  }

  const windowBlurHandler = () => {
    endResize(lastClientX)
  }

  const passiveIfSupported = { passive: false } as const

  if (isTouchSession) {
    ownerDocument.addEventListener('touchmove', touchMoveHandler, passiveIfSupported)
    ownerDocument.addEventListener('touchend', touchEndHandler, passiveIfSupported)
    ownerDocument.addEventListener('touchcancel', touchCancelHandler)
    stopListeners.push(() => {
      ownerDocument.removeEventListener('touchmove', touchMoveHandler)
      ownerDocument.removeEventListener('touchend', touchEndHandler)
      ownerDocument.removeEventListener('touchcancel', touchCancelHandler)
    })
  } else {
    ownerDocument.addEventListener('mousemove', mouseMoveHandler, passiveIfSupported)
    ownerDocument.addEventListener('mouseup', mouseUpHandler, passiveIfSupported)
    stopListeners.push(() => {
      ownerDocument.removeEventListener('mousemove', mouseMoveHandler)
      ownerDocument.removeEventListener('mouseup', mouseUpHandler)
    })
  }

  if (ownerWindow) {
    ownerWindow.addEventListener('blur', windowBlurHandler)
    stopListeners.push(() => ownerWindow.removeEventListener('blur', windowBlurHandler))
  }

  table.setColumnResizing((old) => ({
    ...old,
    startOffset,
    startSize,
    deltaOffset: 0,
    deltaPercentage: 0,
    columnSizingStart,
    isResizingColumn: column.id,
  }))

  return () => endResize(lastClientX)
}

type DataGridTablePinnedBoundary = 'top' | 'bottom'

function getDataGridTableRowSections<TData extends object>(
  table: DataGridTableInstance<TData>,
  rowsPinnable?: boolean,
) {
  if (!rowsPinnable) {
    const none: Row<DataGridFeatures, TData>[] = []

    return { topRows: none, centerRows: table.getRowModel().rows, bottomRows: none }
  }

  return {
    topRows: table.getTopRows(),
    centerRows: table.getCenterRows(),
    bottomRows: table.getBottomRows(),
  }
}

function getDataGridTableOrderedVisibleColumns<TData extends object>(
  table: DataGridTableInstance<TData>,
) {
  return [
    ...table.getStartVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getEndVisibleLeafColumns(),
  ]
}

function getDataGridTableOrderedVisibleCells<TData extends object>(
  row: Row<DataGridFeatures, TData>,
) {
  return [
    ...row.getStartVisibleCells(),
    ...row.getCenterVisibleCells(),
    ...row.getEndVisibleCells(),
  ]
}

function getDataGridTableMergedHeaderGroups<TData extends object>(
  table: DataGridTableInstance<TData>,
) {
  const leftHeaderGroups = table.getStartHeaderGroups()
  const centerHeaderGroups = table.getCenterHeaderGroups()
  const rightHeaderGroups = table.getEndHeaderGroups()

  const headerGroupCount = Math.max(
    leftHeaderGroups.length,
    centerHeaderGroups.length,
    rightHeaderGroups.length,
  )

  return Array.from({ length: headerGroupCount }, (_, index) => {
    const leftGroup = leftHeaderGroups[index]
    const centerGroup = centerHeaderGroups[index]
    const rightGroup = rightHeaderGroups[index]

    return {
      id:
        [leftGroup?.id, centerGroup?.id, rightGroup?.id].filter(Boolean).join(':') ||
        `header-group-${index}`,
      headers: [
        ...(leftGroup?.headers ?? []),
        ...(centerGroup?.headers ?? []),
        ...(rightGroup?.headers ?? []),
      ],
    }
  })
}

function hasDataGridTableRightPinnedColumns<TData extends object>(
  table: DataGridTableInstance<TData>,
) {
  return (table.state.columnPinning.end?.length ?? 0) > 0
}

function DataGridTableFillCol() {
  const { props } = useDataGrid()

  if (!props.tableLayout?.columnsResizable) return null

  return (
    <col
      data-slot="data-grid-table-fill-col"
      style={{ width: 'var(--data-grid-fill-size, 0px)' }}
    />
  )
}

function DataGridTableFillHeadCell() {
  const { props } = useDataGrid()

  if (!props.tableLayout?.columnsResizable) return null

  return (
    <th
      aria-hidden="true"
      data-slot="data-grid-table-fill-head-cell"
      style={{ width: 'var(--data-grid-fill-size, 0px)' }}
      className={cn('p-0', props.tableLayout?.headerBackground && 'bg-muted')}
    />
  )
}

function DataGridTableFillBodyCell() {
  const { props } = useDataGrid()

  if (!props.tableLayout?.columnsResizable) return null

  return (
    <td
      aria-hidden="true"
      data-slot="data-grid-table-fill-body-cell"
      style={{ width: 'var(--data-grid-fill-size, 0px)' }}
      className="p-0"
    />
  )
}

function DataGridTableBase({ children }: { children: ReactNode }) {
  const { props, table } = useDataGrid()
  const leftVisibleColumns = table.getStartVisibleLeafColumns()
  const centerVisibleColumns = table.getCenterVisibleLeafColumns()
  const rightVisibleColumns = table.getEndVisibleLeafColumns()
  const hasRightPinnedColumns = hasDataGridTableRightPinnedColumns(table)

  /**
   * Compute column widths as CSS custom properties once upfront (memoized).
   * Cells reference these via calc(var(--col-X-size) * 1px) so the browser
   * handles width propagation without per-cell getSize() calls or React
   * re-renders of the body.
   */
  const columnSizeVars = useMemo(() => {
    if (!props.tableLayout?.columnsResizable) return undefined
    const headers = table.getFlatHeaders()
    const colSizes: Record<string, number> = {}

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!
      colSizes[`--header-${header.id}-size`] = header.getSize()
      colSizes[`--col-${header.column.id}-size`] = header.column.getSize()
    }

    return colSizes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.tableLayout?.columnsResizable,
    // Visibility/order/pinning change the flat header set, so a column shown
    // after mount must get its size variable even though sizing is untouched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    table.state.columnSizing,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    table.state.columnVisibility,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    table.state.columnOrder,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    table.state.columnPinning,
  ])

  return (
    <table
      data-slot="data-grid-table"
      className={cn(
        'caption-bottom text-left align-middle text-sm font-normal text-foreground rtl:text-right',
        props.tableLayout?.columnsResizable ? 'min-w-0' : 'w-full min-w-full',
        props.tableLayout?.width === 'auto' ? 'table-auto' : 'table-fixed',
        !props.tableLayout?.columnsResizable && '',
        !props.tableLayout?.columnsDraggable && 'border-separate border-spacing-0',
        props.tableClassNames?.base,
      )}
      style={
        props.tableLayout?.columnsResizable
          ? {
              ...columnSizeVars,
              width: `calc(${table.getTotalSize()}px + var(--data-grid-fill-size, 0px))`,
            }
          : undefined
      }
    >
      <colgroup>
        {[...leftVisibleColumns, ...centerVisibleColumns].map((column) => (
          <col
            key={column.id}
            style={
              props.tableLayout?.columnsResizable
                ? { width: `calc(var(--col-${column.id}-size) * 1px)` }
                : props.tableLayout?.width === 'fixed'
                  ? { width: column.getSize() }
                  : undefined
            }
          />
        ))}
        {hasRightPinnedColumns ? <DataGridTableFillCol /> : null}
        {rightVisibleColumns.map((column) => (
          <col
            key={column.id}
            style={
              props.tableLayout?.columnsResizable
                ? { width: `calc(var(--col-${column.id}-size) * 1px)` }
                : props.tableLayout?.width === 'fixed'
                  ? { width: column.getSize() }
                  : undefined
            }
          />
        ))}
        {!hasRightPinnedColumns ? <DataGridTableFillCol /> : null}
      </colgroup>
      {children}
    </table>
  )
}

function DataGridTableViewport({
  children,
  className,
  viewportRef,
  style,
}: {
  children: ReactNode
  className?: string
  viewportRef?: Ref<HTMLDivElement>
  style?: CSSProperties
}) {
  const { props, table, autoSize } = useDataGrid()
  const isColumnsResizable = !!props.tableLayout?.columnsResizable
  const viewportNodeRef = useRef<HTMLDivElement | null>(null)
  const fillStateRef = useRef({ containerWidth: 0, appliedFill: -1 })
  const stopContainerObserverRef = useRef<(() => void) | null>(null)

  // Free space is written as a CSS variable directly on the viewport node
  // instead of React state, so container resizes and column-size commits
  // reach the fill column without re-rendering the grid.
  const syncFillWidth = useCallback(() => {
    const node = viewportNodeRef.current

    if (!node) return

    // Free space can go negative; the fill column clamps at zero but the auto-size column
    // needs the real number so it can shrink back (changed for the CRM).
    const free = fillStateRef.current.containerWidth - table.getTotalSize()
    const fillWidth = Math.max(0, free)

    if (fillStateRef.current.appliedFill !== fillWidth) {
      fillStateRef.current.appliedFill = fillWidth
      node.style.setProperty('--data-grid-fill-size', `${fillWidth}px`)
    }

    autoSize?.apply(free)
  }, [autoSize, table])

  const handleViewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      stopContainerObserverRef.current?.()
      stopContainerObserverRef.current = null
      viewportNodeRef.current = node
      assignRef(viewportRef, node)

      if (!node) return

      if (!isColumnsResizable) {
        fillStateRef.current.appliedFill = -1
        node.style.removeProperty('--data-grid-fill-size')

        return
      }

      // Changed for the CRM: when the viewport scrolls itself (the virtual table with a height),
      // measure the viewport, whose clientWidth excludes its own vertical scrollbar. Measuring
      // the parent made the fill wider than the scroller by the scrollbar's width and left a
      // permanent horizontal scrollbar on systems with non-overlay scrollbars.
      const overflowY = getComputedStyle(node).overflowY
      const scrollsItself = overflowY === 'auto' || overflowY === 'scroll'

      const scrollViewport =
        getDataGridScrollAreaViewport(node) ?? (scrollsItself ? node : node.parentElement)

      const measurementTarget = scrollViewport ?? node

      const measure = () => {
        fillStateRef.current.containerWidth = measurementTarget.clientWidth
        syncFillWidth()
      }

      // First measure runs inside the mount commit, before paint, so the fill
      // column and any meta.autoSize growth land in the first painted frame.
      measure()

      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measure)
        observer.observe(measurementTarget)
        stopContainerObserverRef.current = () => observer.disconnect()
      }
    },
    [isColumnsResizable, syncFillWidth, viewportRef],
  )

  // Column sizing commits and visibility changes alter the table's total size
  // without moving the container, so the fill var must re-sync after renders
  // the ResizeObserver never sees. No-ops when the value is unchanged.
  useLayoutEffect(() => {
    if (!isColumnsResizable) return
    syncFillWidth()
  })

  return (
    <div
      data-slot="data-grid-table-viewport"
      ref={handleViewportRef}
      className={cn('relative min-w-full align-top', className)}
      style={{
        ...(isColumnsResizable
          ? {
              width: `calc(${table.getTotalSize()}px + var(--data-grid-fill-size, 0px))`,
            }
          : undefined),
        ...style,
      }}
    >
      {children}
      <DataGridTableResizeIndicator viewportNodeRef={viewportNodeRef} />
    </div>
  )
}

function DataGridTableHead({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <thead
      className={cn(
        props.tableClassNames?.header,
        props.tableLayout?.headerSticky && props.tableClassNames?.headerSticky,
      )}
    >
      {children}
    </thead>
  )
}

function DataGridTableHeadRow({ children }: { children: ReactNode; rowId: string }) {
  const { props } = useDataGrid()

  return (
    <tr
      className={cn(
        props.tableLayout?.headerBorder && '[&>th]:border-b',
        props.tableLayout?.cellBorder && '*:last:border-e-0',
        props.tableLayout?.stripped && 'bg-transparent',
        props.tableLayout?.headerBackground === false && 'bg-transparent',
        props.tableClassNames?.headerRow,
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableHeadRowCell<TData extends object>({
  children,
  header,
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  header: Header<DataGridFeatures, TData, unknown>
  dndRef?: React.Ref<HTMLTableCellElement>
  dndStyle?: CSSProperties
}) {
  const { props } = useDataGrid()

  const { column } = header
  const isPinned = column.getIsPinned()
  const isFirstStartPinned = isPinned === 'start' && column.getIsFirstColumn('start')
  const isLastStartPinned = isPinned === 'start' && column.getIsLastColumn('start')
  const isFirstEndPinned = isPinned === 'end' && column.getIsFirstColumn('end')
  const isLastEndPinned = isPinned === 'end' && column.getIsLastColumn('end')

  const isLastVisibleColumn =
    column.getIndex() === header.getContext().table.getVisibleLeafColumns().length - 1

  const headerCellSpacing = headerCellSpacingVariants({
    size: props.tableLayout?.dense ? 'dense' : 'default',
  })

  const sortDirection = column.getIsSorted()

  return (
    <th
      ref={dndRef}
      scope="col"
      colSpan={header.colSpan > 1 ? header.colSpan : undefined}
      aria-sort={
        sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : undefined
      }
      style={{
        ...(props.tableLayout?.width === 'fixed' &&
          !props.tableLayout?.columnsResizable && {
            width: header.getSize(),
          }),
        ...(props.tableLayout?.columnsPinnable && column.getCanPin() && getPinningStyles(column)),
        ...(props.tableLayout?.columnsResizable && {
          width: `calc(var(--header-${header.id}-size) * 1px)`,
        }),
        ...(dndStyle ? dndStyle : null),
      }}
      data-pinned={isPinned || undefined}
      data-outer-pinned-col={isFirstStartPinned ? 'start' : isLastEndPinned ? 'end' : undefined}
      data-last-col={isLastStartPinned ? 'start' : isFirstEndPinned ? 'end' : undefined}
      className={cn(
        'relative h-10 text-left align-middle font-medium text-foreground rtl:text-right [&:has([role=checkbox])]:pe-0',
        headerCellSpacing,
        props.tableLayout?.headerBackground && 'bg-muted',
        props.tableLayout?.cellBorder && 'border-e',
        props.tableLayout?.columnsResizable &&
          column.getCanResize() &&
          (isPinned ? 'overflow-hidden' : 'overflow-visible'),
        props.tableLayout?.columnsResizable &&
          column.getCanResize() &&
          isLastVisibleColumn &&
          'pe-8',
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          cn(
            'data-outer-pinned-col:bg-clip-padding data-pinned:isolate data-pinned:bg-background',
            '[&[data-pinned=end]:last-child_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=end][data-last-col=end]]:shadow-[inset_1px_0_0_0_var(--border)] [&[data-pinned=start][data-last-col=start]]:shadow-[inset_-1px_0_0_0_var(--border)]',
            // reUI also hid the handle on the last start-pinned column (`opacity-0`); dropped for the
            // CRM so its hover bar shows like every other column's.
            '[&:not([data-pinned]):has(+[data-pinned])_div.cursor-col-resize:last-child]:opacity-0',
          ),
        header.column.columnDef.meta?.headerClassName,
        // Edge detection spans the full visible leaf order; the header's own
        // group only covers one pinning bucket.
        column.getIndex() === 0 || isLastVisibleColumn ? props.tableClassNames?.edgeCell : '',
      )}
    >
      {children}
    </th>
  )
}

/**
 * TanStack's own default, restated here on purpose.
 *
 * v8 merged each feature's default table options into `table.options`, so
 * reading `table.options.columnResizeMode` gave you `"onEnd"` even when the
 * consumer never set it. v9 resolves feature defaults internally and leaves
 * the option `undefined` on the instance, so the old `?? table.options...`
 * fallback quietly produced `undefined` - and every grid that had not opted
 * into a mode explicitly lost the onEnd drag session: no cursor lock, no
 * vertical indicator, and an immediate commit instead of a deferred one.
 */
const DATA_GRID_DEFAULT_COLUMN_RESIZE_MODE = 'onEnd' as const

function getDataGridColumnResizeMode(
  layoutMode: 'onChange' | 'onEnd' | undefined,
  tableMode: 'onChange' | 'onEnd' | undefined,
) {
  return layoutMode ?? tableMode ?? DATA_GRID_DEFAULT_COLUMN_RESIZE_MODE
}

function DataGridTableHeadRowCellResize<TData extends object>({
  header,
}: {
  header: Header<DataGridFeatures, TData, unknown>
}) {
  const { props, table } = useDataGrid<TData>()
  const { column } = header
  const isPinned = column.getIsPinned()

  const isLastVisibleColumn =
    column.getIndex() === header.getContext().table.getVisibleLeafColumns().length - 1

  const isResizeModeOnEnd =
    getDataGridColumnResizeMode(
      props.tableLayout?.columnsResizeMode,
      table.options.columnResizeMode,
    ) === 'onEnd'

  const stopResizeSessionRef = useRef<(() => void) | undefined>(undefined)

  // End a live drag if the handle unmounts mid-resize so document listeners
  // and the app-wide col-resize cursor don't outlive the grid.
  useEffect(() => {
    return () => {
      stopResizeSessionRef.current?.()
      stopResizeSessionRef.current = undefined
    }
  }, [])

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    // Only the primary button starts a resize; guard before preventDefault so
    // right-click still opens the context menu.
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    if (isResizeModeOnEnd) {
      stopResizeSessionRef.current?.()
      stopResizeSessionRef.current = startDataGridColumnResizeOnEnd(event, header, table)

      return
    }

    header.getResizeHandler()(event)
  }

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (isResizeModeOnEnd) {
      stopResizeSessionRef.current?.()
      stopResizeSessionRef.current = startDataGridColumnResizeOnEnd(event, header, table)

      return
    }

    header.getResizeHandler()(event)
  }

  return (
    <div
      {...{
        onDoubleClick: () => column.resetSize(),
        onMouseDown: handleMouseDown,
        onTouchStart: handleTouchStart,
        className: cn(
          'user-select-none absolute top-0 z-10 flex h-full cursor-col-resize touch-none hover:before:w-0.5 hover:before:bg-primary',
          isLastVisibleColumn
            ? 'end-0 w-5 justify-end before:absolute before:inset-y-0 before:end-0 before:w-px before:bg-border'
            : isPinned
              ? cn(
                  // A pinned column is sticky, so the handle sits inside the
                  // cell instead of straddling the boundary, where the next
                  // sticky cell would paint over it.
                  'end-0 w-5 justify-end before:absolute before:inset-y-0 before:end-0 before:w-px',
                  // With the pin affordance on, the pinned edge already draws
                  // its own separator and a resize line would double it. But
                  // pinning is also usable purely as an ordering lock, with no
                  // affordance and no separator -- and there this line is the
                  // only thing marking the edge, so hiding it left a resizable
                  // column showing a resize cursor and no indicator at all.
                  props.tableLayout?.columnsPinnable
                    ? 'before:hidden hover:before:block'
                    : 'before:bg-border',
                )
              : '-end-2 w-5 justify-center before:absolute before:inset-y-0 before:w-px before:-translate-x-px before:bg-border',
          column.getIsResizing() &&
            (isResizeModeOnEnd
              ? 'opacity-100'
              : isLastVisibleColumn
                ? 'opacity-100 before:absolute before:inset-y-0 before:end-0 before:block before:w-0.5 before:bg-primary'
                : 'opacity-100 before:block before:w-0.5 before:bg-primary'),
        ),
      }}
    />
  )
}

function DataGridTableResizeIndicator({
  viewportNodeRef,
}: {
  viewportNodeRef: RefObject<HTMLDivElement | null>
}) {
  const { props, table } = useDataGrid()
  const indicatorRef = useRef<HTMLDivElement | null>(null)
  const indicatorHeadRef = useRef<HTMLDivElement | null>(null)

  // Header height is stable for the duration of a drag; caching it per
  // session avoids a forced layout (querySelector + getBoundingClientRect)
  // on every mousemove.
  const headerHeightCacheRef = useRef<{
    key: string | false
    value: number
  }>({ key: false, value: 0 })

  const columnResizing = table.state.columnResizing
  const resizingColumnId = columnResizing.isResizingColumn

  const resizeMode = getDataGridColumnResizeMode(
    props.tableLayout?.columnsResizeMode,
    table.options.columnResizeMode,
  )

  const isActive = !!(
    props.tableLayout?.columnsResizable &&
    resizeMode === 'onEnd' &&
    resizingColumnId
  )

  // Positioning happens imperatively after each drag-frame render: layout
  // reads (viewport rect, thead height) and ref access belong outside render,
  // and writing styles directly avoids holding the viewport node in React
  // state, which would cost every grid a second render pass at mount.
  useLayoutEffect(() => {
    const indicator = indicatorRef.current
    const indicatorHead = indicatorHeadRef.current
    const viewportElement = viewportNodeRef.current

    if (!isActive || !indicator || !indicatorHead || !resizingColumnId) return

    const resizingHeader = table
      .getFlatHeaders()
      .find((header) => header.column.id === resizingColumnId || header.id === resizingColumnId)

    if (!resizingHeader) return

    // deltaOffset is a logical delta (already direction-adjusted); translate
    // by the physical pointer movement so the indicator follows the cursor
    // in RTL instead of mirroring it.
    const directionMultiplier = table.options.columnResizeDirection === 'rtl' ? -1 : 1
    const deltaOffset = (columnResizing.deltaOffset ?? 0) * directionMultiplier

    if (headerHeightCacheRef.current.key !== resizingColumnId) {
      headerHeightCacheRef.current = {
        key: resizingColumnId,
        value:
          viewportElement
            ?.querySelector('[data-slot="data-grid-table"] thead')
            ?.getBoundingClientRect().height ?? 0,
      }
    }

    const headerHeight = headerHeightCacheRef.current.value

    const indicatorLeft =
      columnResizing.startOffset != null && viewportElement
        ? columnResizing.startOffset - viewportElement.getBoundingClientRect().left
        : resizingHeader.getStart() + resizingHeader.getSize()

    indicator.style.left = `${indicatorLeft}px`
    indicator.style.transform = `translateX(${deltaOffset}px)`
    indicatorHead.style.height = `${Math.max(headerHeight, 6)}px`
  })

  if (!isActive) return null

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      data-slot="data-grid-table-resize-indicator"
      className="pointer-events-none absolute inset-y-0 z-50"
    >
      <div className="absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-primary/85" />
      <div
        ref={indicatorHeadRef}
        className="style-nova:rounded-b-sm style-maia:rounded-b-md style-lyra:rounded-b-none style-mira:rounded-b-sm style-luma:rounded-b-lg style-sera:rounded-b-none style-rhea:rounded-b-lg absolute top-0 left-0 -translate-x-1/2 bg-primary shadow-xs style-vega:rounded-b-sm"
        style={{ width: 5 }}
      />
    </div>
  )
}

function DataGridTableRowSpacer() {
  return <tbody aria-hidden="true" className="h-2" data-slot="data-grid-table-body-spacer"></tbody>
}

function DataGridTableBody({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <tbody
      data-slot="data-grid-table-body"
      className={cn(
        props.tableLayout?.rowRounded &&
          'style-nova:[&_td:first-child]:rounded-l-lg style-maia:[&_td:first-child]:rounded-l-2xl style-lyra:[&_td:first-child]:rounded-l-none style-mira:[&_td:first-child]:rounded-l-lg style-luma:[&_td:first-child]:rounded-l-3xl style-sera:[&_td:first-child]:rounded-l-none style-rhea:[&_td:first-child]:rounded-l-2xl style-vega:[&_td:first-child]:rounded-l-lg',
        props.tableLayout?.rowRounded &&
          'style-nova:[&_td:last-child]:rounded-r-lg style-maia:[&_td:last-child]:rounded-r-2xl style-lyra:[&_td:last-child]:rounded-r-none style-mira:[&_td:last-child]:rounded-r-lg style-luma:[&_td:last-child]:rounded-r-3xl style-sera:[&_td:last-child]:rounded-r-none style-rhea:[&_td:last-child]:rounded-r-2xl style-vega:[&_td:last-child]:rounded-r-lg',
        props.tableClassNames?.body,
      )}
    >
      {children}
    </tbody>
  )
}

function DataGridTableFoot({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <tfoot data-slot="data-grid-table-foot" className={cn(props.tableClassNames?.footer)}>
      {children}
    </tfoot>
  )
}

function DataGridTableBodyRow<TData extends object>({
  children,
  row,
  pinnedBoundary,
  rowRef,
  dndRef,
  dndStyle,
  dataIndex,
}: {
  children: ReactNode
  row: Row<DataGridFeatures, TData>
  pinnedBoundary?: DataGridTablePinnedBoundary
  rowRef?: React.Ref<HTMLTableRowElement>
  dndRef?: React.Ref<HTMLTableRowElement>
  dndStyle?: CSSProperties
  dataIndex?: number
}) {
  const { props, table } = useDataGrid()
  const isRowPinned = row.getIsPinned()

  const bodyRowBottomBorderClasses =
    '[&:not(:last-child)>td]:border-b [tbody:has(+tfoot)_&:last-child>td]:border-b [*:has(>[data-slot=data-grid]+[data-slot=data-grid-pagination])_[data-slot=data-grid]_&:last-child>td]:border-b'

  return (
    <tr
      ref={(node) => {
        assignRef(rowRef, node)
        assignRef(dndRef, node)
      }}
      style={{ ...(dndStyle ? dndStyle : null) }}
      data-state={table.options.enableRowSelection && row.getIsSelected() ? 'selected' : undefined}
      data-index={dataIndex}
      data-row-id={row.id}
      data-depth={row.depth || undefined}
      data-row-pinned={isRowPinned || undefined}
      data-row-pinned-boundary={pinnedBoundary}
      onClick={() => props.onRowClick && props.onRowClick(row.original)}
      className={cn(
        'hover:bg-muted/40 data-[state=selected]:bg-muted/50',
        props.onRowClick && 'cursor-pointer',
        !props.tableLayout?.stripped && props.tableLayout?.rowBorder && bodyRowBottomBorderClasses,
        props.tableLayout?.cellBorder && `*:last:border-e-0 ${bodyRowBottomBorderClasses}`,
        // Virtualized rows stripe by absolute row index (CSS :nth-child
        // parity flips as spacer rows resize while scrolling).
        props.tableLayout?.stripped &&
          (dataIndex !== undefined
            ? cn('hover:bg-transparent', dataIndex % 2 === 0 && 'bg-muted/90 hover:bg-muted')
            : 'odd:bg-muted/90 hover:bg-transparent odd:hover:bg-muted'),
        table.options.enableRowSelection && '*:first:relative',
        props.tableLayout?.rowsPinnable && isRowPinned && 'bg-muted/30 hover:bg-muted/50',
        pinnedBoundary === 'top' &&
          '[&>td]:shadow-[0_2px_0_rgba(0,0,0,0.03)] dark:[&>td]:shadow-[0_2px_0_rgba(255,255,255,0.06)]',
        pinnedBoundary === 'bottom' &&
          '[&>td]:shadow-[0_2px_0_rgba(0,0,0,0.03)] dark:[&>td]:shadow-[0_2px_0_rgba(255,255,255,0.06)]',
        props.tableClassNames?.bodyRow,
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableBodyRowExpandded<TData extends object>({
  row,
}: {
  row: Row<DataGridFeatures, TData>
}) {
  const { props, table } = useDataGrid()

  const expandedContent = table
    .getAllColumns()
    .find((column) => column.columnDef.meta?.expandedContent)?.columnDef.meta?.expandedContent

  // Tree and grouped rows share row.getIsExpanded() with detail expansion.
  // Without a detail column there is nothing to render, and an empty <tr>
  // would break striping parity, rowBorder, and virtual row measurement.
  if (!expandedContent) return null

  const bodyRowBottomBorderClasses =
    '[&:not(:last-child)>td]:border-b [tbody:has(+tfoot)_&:last-child>td]:border-b [*:has(>[data-slot=data-grid]+[data-slot=data-grid-pagination])_[data-slot=data-grid]_&:last-child>td]:border-b'

  return (
    <tr className={cn(props.tableLayout?.rowBorder && bodyRowBottomBorderClasses)}>
      <td
        colSpan={
          getDataGridTableOrderedVisibleCells(row).length +
          (props.tableLayout?.columnsResizable ? 1 : 0)
        }
      >
        {expandedContent(row.original)}
      </td>
    </tr>
  )
}

function DataGridTableBodyRowCell<TData extends object>({
  children,
  cell,
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  cell: Cell<DataGridFeatures, TData, unknown>
  dndRef?: React.Ref<HTMLTableCellElement>
  dndStyle?: CSSProperties
}) {
  const { props } = useDataGrid()

  const { column, row } = cell
  const isPinned = column.getIsPinned()
  const isLastStartPinned = isPinned === 'start' && column.getIsLastColumn('start')
  const isFirstEndPinned = isPinned === 'end' && column.getIsFirstColumn('end')

  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? 'dense' : 'default',
  })

  return (
    <td
      ref={dndRef}
      style={{
        ...(props.tableLayout?.columnsPinnable && column.getCanPin() && getPinningStyles(column)),
        ...(props.tableLayout?.columnsResizable && {
          width: `calc(var(--col-${column.id}-size) * 1px)`,
        }),
        ...(dndStyle ? dndStyle : null),
      }}
      data-pinned={isPinned || undefined}
      data-last-col={isLastStartPinned ? 'start' : isFirstEndPinned ? 'end' : undefined}
      className={cn(
        'align-middle',
        bodyCellSpacing,
        props.tableLayout?.cellBorder && 'border-e',
        props.tableLayout?.columnsResizable && column.getCanResize() && 'truncate',
        cell.column.columnDef.meta?.cellClassName,
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          cn(
            'data-pinned:isolate data-pinned:bg-background',
            '[&[data-pinned=start][data-last-col=start]]:shadow-[inset_-1px_0_0_0_var(--border)]',
            '[&[data-pinned=end][data-last-col=end]]:shadow-[inset_1px_0_0_0_var(--border)]',
          ),
        column.getIndex() === 0 || column.getIndex() === row.getVisibleCells().length - 1
          ? props.tableClassNames?.edgeCell
          : '',
      )}
    >
      {children}
    </td>
  )
}

function DataGridTableRenderedRow<TData extends object>({
  row,
  pinnedBoundary,
  rowRef,
  rowIndex,
}: {
  row: Row<DataGridFeatures, TData>
  pinnedBoundary?: DataGridTablePinnedBoundary
  rowRef?: React.Ref<HTMLTableRowElement>
  /** Virtualized list index, rendered as data-index for measureElement. */
  rowIndex?: number
}) {
  const { props, table } = useDataGrid()
  const startVisibleCells = row.getStartVisibleCells()
  const centerVisibleCells = row.getCenterVisibleCells()
  const endVisibleCells = row.getEndVisibleCells()
  const hasRightPinnedColumns = hasDataGridTableRightPinnedColumns(table)

  return (
    <Fragment>
      <DataGridTableBodyRow
        row={row}
        pinnedBoundary={pinnedBoundary}
        rowRef={rowRef}
        dataIndex={rowIndex}
      >
        {[...startVisibleCells, ...centerVisibleCells].map(
          (cell: Cell<DataGridFeatures, TData, unknown>) => (
            <DataGridTableBodyRowCell cell={cell} key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </DataGridTableBodyRowCell>
          ),
        )}
        {props.tableLayout?.columnsResizable && hasRightPinnedColumns ? (
          <DataGridTableFillBodyCell />
        ) : null}
        {endVisibleCells.map((cell: Cell<DataGridFeatures, TData, unknown>) => (
          <DataGridTableBodyRowCell cell={cell} key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </DataGridTableBodyRowCell>
        ))}
        {props.tableLayout?.columnsResizable && !hasRightPinnedColumns ? (
          <DataGridTableFillBodyCell />
        ) : null}
      </DataGridTableBodyRow>
      {row.getIsExpanded() && <DataGridTableBodyRowExpandded row={row} />}
    </Fragment>
  )
}

function DataGridTableEmpty() {
  const { table, props } = useDataGrid()

  const visibleColumnCount =
    getDataGridTableOrderedVisibleColumns(table).length +
    (props.tableLayout?.columnsResizable ? 1 : 0)

  return (
    <tr>
      <td colSpan={Math.max(visibleColumnCount, 1)} className="p-0">
        {/* The cell spans every column; keep the message in the visible part of a wide table. */}
        <div className="sticky left-0 max-w-[100vw] py-6 text-center text-sm text-muted-foreground">
          {props.emptyMessage || 'No data available'}
        </div>
      </td>
    </tr>
  )
}

/**
 * Selection cell.
 *
 * The `Subscribe` wrapper is the v9 fix for React Compiler, and it is why this
 * file no longer needs `"use no memo"`. `useTable` hands back a fresh table on
 * every state change, which covers anything read through `table`, but this
 * component reads selection through `row.getIsSelected()` - a builder call
 * that hides its state dependency from the compiler. Rendered inside a column
 * `cell` template it receives a *stable* row, so the compiler is free to
 * memoize this JSX and never re-run those reads, which shows up as checkboxes
 * that do not respond to clicks.
 *
 * Subscribing to the row-selection atom gives the compiler a dependency it can
 * see. Note the standalone `Subscribe` rather than `table.Subscribe`: inside a
 * cell template the `table` handed to the column def is the core `Table`, which
 * has no `Subscribe` attached.
 */
function DataGridTableRowSelect<TData extends object>({
  row,
}: {
  row: Row<DataGridFeatures, TData>
}) {
  return (
    <Subscribe source={row.table.atoms.rowSelection}>
      {() => (
        <>
          <div
            className={cn(
              'absolute inset-s-0 top-0 bottom-0 hidden w-[2px] bg-primary',
              row.getIsSelected() && 'block',
            )}
          ></div>
          <Checkbox
            checked={row.getIsSelected()}
            indeterminate={row.getIsSomeSelected() && !row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(event) => {
              // Selection must not bubble into the row's onRowClick handler.
              event.stopPropagation()
            }}
            aria-label="Select row"
            className="align-[inherit]"
          />
        </>
      )}
    </Subscribe>
  )
}

function DataGridTableRowSelectAll() {
  const { table, recordCount, isLoading } = useDataGrid()

  // `getIsSomePageRowsSelected()` means "at least one" in v9, where v8 meant
  // "some but not all", so the all-selected case has to be excluded explicitly
  // or the header checkbox stays indeterminate once every row is checked.
  return (
    <Subscribe source={table.atoms.rowSelection}>
      {() => {
        const isAllSelected = table.getIsAllPageRowsSelected()
        const isSomeSelected = table.getIsSomePageRowsSelected()

        return (
          <Checkbox
            checked={isAllSelected}
            indeterminate={isSomeSelected && !isAllSelected}
            disabled={isLoading || recordCount === 0}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className="align-[inherit]"
          />
        )
      }}
    </Subscribe>
  )
}

export {
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableBodyRow,
  DataGridTableBodyRowCell,
  DataGridTableBodyRowExpandded,
  DataGridTableRenderedRow,
  DataGridTableEmpty,
  DataGridTableFillBodyCell,
  DataGridTableFillHeadCell,
  DataGridTableFoot,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableHeadRowCellResize,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
  DataGridTableRowSpacer,
  DataGridTableViewport,
  getDataGridScrollAreaViewport,
  getDataGridTableMergedHeaderGroups,
  getPinningStyles,
  getDataGridTableRowSections,
  hasDataGridTableRightPinnedColumns,
}

export type { DataGridTablePinnedBoundary }
